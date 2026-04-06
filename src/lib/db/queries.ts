import { Pool, QueryResultRow } from 'pg'
import {
  PgRole, PgDatabase, PgPrivilege, PgCurrentUser,
  PermissionsMatrix,
  DatabasePermission, SchemaPermission, TablePermission,
  SequencePermission, FunctionPermission, TypePermission,
  FdwPermission, ForeignServerPermission,
  ColumnPrivilege, RlsPolicyRow, DefaultPrivilege,
  ConfigSetting, TablespacePrivilege, OwnedObjectGroup, RoleGrantee,
} from '@/types'

export async function getRoles(pool: Pool): Promise<PgRole[]> {
  const { rows } = await pool.query<PgRole>(`
    SELECT
      r.oid,
      r.rolname,
      r.rolsuper,
      r.rolinherit,
      r.rolcreaterole,
      r.rolcreatedb,
      r.rolcanlogin,
      r.rolreplication,
      r.rolbypassrls,
      r.rolconnlimit,
      r.rolvaliduntil::text,
      ARRAY(
        SELECT b.rolname
        FROM pg_catalog.pg_auth_members m
        JOIN pg_catalog.pg_roles b ON m.roleid = b.oid
        WHERE m.member = r.oid
      ) AS memberof
    FROM pg_catalog.pg_roles r
    ORDER BY r.rolname
  `)
  return rows.map((r) => ({
    ...r,
    memberof: Array.isArray(r.memberof) ? r.memberof : [],
  }))
}

export async function getDatabases(pool: Pool): Promise<PgDatabase[]> {
  const { rows } = await pool.query<PgDatabase>(`
    SELECT d.oid, d.datname, r.rolname AS owner, d.datacl::text[]
    FROM pg_catalog.pg_database d
    JOIN pg_catalog.pg_roles r ON r.oid = d.datdba
    WHERE d.datistemplate = false
    ORDER BY d.datname
  `)
  return rows
}

export async function getTablePrivileges(pool: Pool, database: string): Promise<PgPrivilege[]> {
  const { rows } = await pool.query<PgPrivilege>(`
    SELECT grantee, table_schema, table_name, privilege_type, is_grantable
    FROM information_schema.role_table_grants
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY grantee, table_schema, table_name
  `)
  return rows
}

export async function createRole(pool: Pool, rolename: string, options: {
  canLogin?: boolean
  superuser?: boolean
  createDb?: boolean
  createRole?: boolean
  password?: string
  validUntil?: string
}): Promise<void> {
  const parts = [`CREATE ROLE "${rolename}"`]
  const attrs: string[] = []

  if (options.canLogin) attrs.push('LOGIN')
  if (options.superuser) attrs.push('SUPERUSER')
  if (options.createDb) attrs.push('CREATEDB')
  if (options.createRole) attrs.push('CREATEROLE')
  if (options.password) attrs.push(`PASSWORD '${options.password.replace(/'/g, "''")}'`)
  if (options.validUntil) attrs.push(`VALID UNTIL '${options.validUntil}'`)

  if (attrs.length) parts.push('WITH', ...attrs)
  await pool.query(parts.join(' '))
}

export async function dropRole(pool: Pool, rolename: string): Promise<void> {
  await pool.query(`DROP ROLE IF EXISTS "${rolename}"`)
}

export async function getUsers(pool: Pool): Promise<PgRole[]> {
  const { rows } = await pool.query<PgRole>(`
    SELECT
      r.oid,
      r.rolname,
      r.rolsuper,
      r.rolinherit,
      r.rolcreaterole,
      r.rolcreatedb,
      r.rolcanlogin,
      r.rolreplication,
      r.rolbypassrls,
      r.rolconnlimit,
      r.rolvaliduntil::text,
      ARRAY(
        SELECT b.rolname
        FROM pg_catalog.pg_auth_members m
        JOIN pg_catalog.pg_roles b ON m.roleid = b.oid
        WHERE m.member = r.oid
      ) AS memberof
    FROM pg_catalog.pg_roles r
    WHERE r.rolcanlogin = true
    ORDER BY r.rolname
  `)
  return rows.map((r) => ({
    ...r,
    memberof: Array.isArray(r.memberof) ? r.memberof : [],
  }))
}

export async function getCurrentUserInfo(pool: Pool): Promise<PgCurrentUser> {
  const { rows: whoRows } = await pool.query<{ username: string; session_user: string }>(
    `SELECT current_user AS username, session_user`
  )
  const { username, session_user: sessionUser } = whoRows[0]

  const { rows: roleRows } = await pool.query<Omit<PgCurrentUser, 'username' | 'sessionUser' | 'dbPrivileges' | 'memberof'> & { memberof: string[] }>(`
    SELECT
      r.rolsuper,
      r.rolinherit,
      r.rolcreaterole,
      r.rolcreatedb,
      r.rolcanlogin,
      r.rolreplication,
      r.rolbypassrls,
      r.rolconnlimit,
      r.rolvaliduntil::text,
      ARRAY(
        SELECT b.rolname
        FROM pg_catalog.pg_auth_members m
        JOIN pg_catalog.pg_roles b ON m.roleid = b.oid
        WHERE m.member = r.oid
      ) AS memberof
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = current_user
  `)

  const roleInfo = roleRows[0] ?? {
    rolsuper: false, rolinherit: false, rolcreaterole: false, rolcreatedb: false,
    rolcanlogin: false, rolreplication: false, rolbypassrls: false, rolconnlimit: -1,
    rolvaliduntil: null, memberof: [],
  }

  const { rows: dbRows } = await pool.query<{ datname: string; can_connect: boolean; can_create: boolean; can_temp: boolean }>(`
    SELECT
      datname,
      has_database_privilege(current_user, datname, 'CONNECT') AS can_connect,
      has_database_privilege(current_user, datname, 'CREATE')  AS can_create,
      has_database_privilege(current_user, datname, 'TEMP')    AS can_temp
    FROM pg_catalog.pg_database
    WHERE datistemplate = false
    ORDER BY datname
  `)

  return {
    username,
    sessionUser,
    ...roleInfo,
    memberof: Array.isArray(roleInfo.memberof) ? roleInfo.memberof : [],
    dbPrivileges: dbRows.map((d) => ({
      datname: d.datname,
      canConnect: d.can_connect,
      canCreate: d.can_create,
      canTemp: d.can_temp,
    })),
  }
}

// ─── Permissions matrix ────────────────────────────────────────────────────

export async function getPermissionsMatrix(pool: Pool, rolename: string): Promise<PermissionsMatrix> {
  async function safe<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    try {
      const { rows } = await pool.query<T>(sql, params)
      return rows
    } catch {
      return []
    }
  }

  // ACL-based privilege checks: read ACL arrays directly from catalog so this
  // works regardless of whether the connection user is a superuser.
  // effective_roles = the target role itself + PUBLIC (OID 0) + all roles it is
  // a direct member of (inherited grants).
  const er = `
    WITH effective_roles AS (
      SELECT r.oid
        FROM pg_catalog.pg_roles r
       WHERE r.rolname = $1
      UNION ALL
      SELECT 0::oid
      UNION ALL
      SELECT m.roleid
        FROM pg_catalog.pg_auth_members m
        JOIN pg_catalog.pg_roles r ON r.oid = m.member AND r.rolname = $1
    )
  `

  const [
    databases, schemas, tables, sequences, functions, types, fdws, foreignServers,
    columnPrivsRaw, rlsRaw, defaultPrivsRaw, configRaw, tablespacesRaw, ownedRaw, granteesRaw,
  ] = await Promise.all([

      // Databases – cluster-wide, always fully visible via pg_database
      safe<{ oid: number; name: string; owner: string; owner_oid: number; connect: boolean; create_db: boolean; temp: boolean }>(`
        ${er}
        SELECT
          d.oid,
          d.datname AS name,
          (SELECT rolname FROM pg_catalog.pg_roles WHERE oid = d.datdba) AS owner,
          d.datdba AS owner_oid,
          coalesce(bool_or(a.privilege_type = 'CONNECT'), false) AS connect,
          coalesce(bool_or(a.privilege_type = 'CREATE'),  false) AS create_db,
          coalesce(bool_or(a.privilege_type = 'TEMP'),    false) AS temp
        FROM pg_catalog.pg_database d
        LEFT JOIN LATERAL aclexplode(
          coalesce(d.datacl, acldefault('d', d.datdba))
        ) a ON a.grantee IN (SELECT oid FROM effective_roles)
        WHERE d.datistemplate = false
        GROUP BY d.oid, d.datname, d.datdba
        ORDER BY d.datname
      `, [rolename]),

      // Schemas – all schemas in the connected database, even ones with no access
      safe<{ oid: number; name: string; owner: string; owner_oid: number; usage: boolean; create_schema: boolean }>(`
        ${er}
        SELECT
          n.oid,
          n.nspname AS name,
          (SELECT rolname FROM pg_catalog.pg_roles WHERE oid = n.nspowner) AS owner,
          n.nspowner AS owner_oid,
          coalesce(bool_or(a.privilege_type = 'USAGE'),  false) AS usage,
          coalesce(bool_or(a.privilege_type = 'CREATE'), false) AS create_schema
        FROM pg_catalog.pg_namespace n
        LEFT JOIN LATERAL aclexplode(
          coalesce(n.nspacl, acldefault('n', n.nspowner))
        ) a ON a.grantee IN (SELECT oid FROM effective_roles)
        WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
        GROUP BY n.oid, n.nspname, n.nspowner
        ORDER BY n.nspname
      `, [rolename]),

      // Tables / views / materialized views / foreign tables / partitioned tables
      safe<{
        oid: number; schema_name: string; name: string; owner: string; owner_oid: number; kind: string
        sel: boolean; ins: boolean; upd: boolean; del: boolean
        trunc: boolean; refs: boolean; trig: boolean
      }>(`
        ${er}
        SELECT
          c.oid,
          n.nspname AS schema_name,
          c.relname AS name,
          (SELECT rolname FROM pg_catalog.pg_roles WHERE oid = c.relowner) AS owner,
          c.relowner AS owner_oid,
          c.relkind::text AS kind,
          coalesce(bool_or(a.privilege_type = 'SELECT'),     false) AS sel,
          coalesce(bool_or(a.privilege_type = 'INSERT'),     false) AS ins,
          coalesce(bool_or(a.privilege_type = 'UPDATE'),     false) AS upd,
          coalesce(bool_or(a.privilege_type = 'DELETE'),     false) AS del,
          coalesce(bool_or(a.privilege_type = 'TRUNCATE'),   false) AS trunc,
          coalesce(bool_or(a.privilege_type = 'REFERENCES'), false) AS refs,
          coalesce(bool_or(a.privilege_type = 'TRIGGER'),    false) AS trig
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN LATERAL aclexplode(
          coalesce(c.relacl, acldefault('r', c.relowner))
        ) a ON a.grantee IN (SELECT oid FROM effective_roles)
        WHERE c.relkind IN ('r','v','m','f','p')
          AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
        GROUP BY c.oid, n.nspname, c.relname, c.relkind, c.relowner
        ORDER BY n.nspname, c.relname
      `, [rolename]),

      // Sequences
      safe<{ oid: number; schema_name: string; name: string; owner: string; owner_oid: number; usage: boolean; sel: boolean; upd: boolean }>(`
        ${er}
        SELECT
          c.oid,
          n.nspname AS schema_name,
          c.relname AS name,
          (SELECT rolname FROM pg_catalog.pg_roles WHERE oid = c.relowner) AS owner,
          c.relowner AS owner_oid,
          coalesce(bool_or(a.privilege_type = 'USAGE'),  false) AS usage,
          coalesce(bool_or(a.privilege_type = 'SELECT'), false) AS sel,
          coalesce(bool_or(a.privilege_type = 'UPDATE'), false) AS upd
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN LATERAL aclexplode(
          coalesce(c.relacl, acldefault('S', c.relowner))
        ) a ON a.grantee IN (SELECT oid FROM effective_roles)
        WHERE c.relkind = 'S'
          AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
        GROUP BY c.oid, n.nspname, c.relname, c.relowner
        ORDER BY n.nspname, c.relname
      `, [rolename]),

      // Functions / procedures / aggregates / window functions
      safe<{ oid: number; schema_name: string; name: string; owner: string; owner_oid: number; kind: string; args: string; execute: boolean }>(`
        ${er}
        SELECT
          p.oid,
          n.nspname AS schema_name,
          p.proname AS name,
          (SELECT rolname FROM pg_catalog.pg_roles WHERE oid = p.proowner) AS owner,
          p.proowner AS owner_oid,
          p.prokind::text AS kind,
          pg_get_function_identity_arguments(p.oid) AS args,
          coalesce(bool_or(a.privilege_type = 'EXECUTE'), false) AS execute
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        LEFT JOIN LATERAL aclexplode(
          coalesce(p.proacl, acldefault('f', p.proowner))
        ) a ON a.grantee IN (SELECT oid FROM effective_roles)
        WHERE n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
        GROUP BY p.oid, n.nspname, p.proname, p.prokind, p.proowner
        ORDER BY n.nspname, p.proname, p.oid
      `, [rolename]),

      // Types (domains, enums, ranges, multiranges)
      safe<{ oid: number; schema_name: string; name: string; owner: string; owner_oid: number; kind: string; usage: boolean }>(`
        ${er}
        SELECT
          t.oid,
          n.nspname AS schema_name,
          t.typname AS name,
          (SELECT rolname FROM pg_catalog.pg_roles WHERE oid = t.typowner) AS owner,
          t.typowner AS owner_oid,
          t.typtype::text AS kind,
          coalesce(bool_or(a.privilege_type = 'USAGE'), false) AS usage
        FROM pg_catalog.pg_type t
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        LEFT JOIN LATERAL aclexplode(
          coalesce(t.typacl, acldefault('T', t.typowner))
        ) a ON a.grantee IN (SELECT oid FROM effective_roles)
        WHERE n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
          AND t.typtype IN ('d','e','r','m')
          AND t.typelem = 0
        GROUP BY t.oid, n.nspname, t.typname, t.typtype, t.typowner
        ORDER BY n.nspname, t.typname
      `, [rolename]),

      // Foreign data wrappers
      safe<{ oid: number; name: string; owner: string; owner_oid: number; usage: boolean }>(`
        ${er}
        SELECT
          w.oid,
          w.fdwname AS name,
          (SELECT rolname FROM pg_catalog.pg_roles WHERE oid = w.fdwowner) AS owner,
          w.fdwowner AS owner_oid,
          coalesce(bool_or(a.privilege_type = 'USAGE'), false) AS usage
        FROM pg_catalog.pg_foreign_data_wrapper w
        LEFT JOIN LATERAL aclexplode(
          coalesce(w.fdwacl, acldefault('F', w.fdwowner))
        ) a ON a.grantee IN (SELECT oid FROM effective_roles)
        GROUP BY w.oid, w.fdwname, w.fdwowner
        ORDER BY w.fdwname
      `, [rolename]),

      // Foreign servers
      safe<{ oid: number; name: string; owner: string; owner_oid: number; usage: boolean }>(`
        ${er}
        SELECT
          s.oid,
          s.srvname AS name,
          (SELECT rolname FROM pg_catalog.pg_roles WHERE oid = s.srvowner) AS owner,
          s.srvowner AS owner_oid,
          coalesce(bool_or(a.privilege_type = 'USAGE'), false) AS usage
        FROM pg_catalog.pg_foreign_server s
        LEFT JOIN LATERAL aclexplode(
          coalesce(s.srvacl, acldefault('s', s.srvowner))
        ) a ON a.grantee IN (SELECT oid FROM effective_roles)
        GROUP BY s.oid, s.srvname, s.srvowner
        ORDER BY s.srvname
      `, [rolename]),

      // Column-level privileges — only columns with explicit attacl grants to this role
      safe<{ schema_name: string; table_name: string; column_name: string; sel: boolean; ins: boolean; upd: boolean; refs: boolean }>(`
        ${er}
        SELECT
          n.nspname          AS schema_name,
          c.relname          AS table_name,
          a.attname          AS column_name,
          bool_or(acl.privilege_type = 'SELECT')     AS sel,
          bool_or(acl.privilege_type = 'INSERT')     AS ins,
          bool_or(acl.privilege_type = 'UPDATE')     AS upd,
          bool_or(acl.privilege_type = 'REFERENCES') AS refs
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL aclexplode(a.attacl) acl
        WHERE a.attacl IS NOT NULL
          AND a.attnum > 0
          AND NOT a.attisdropped
          AND acl.grantee IN (SELECT oid FROM effective_roles)
          AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
        GROUP BY n.nspname, c.relname, a.attname, a.attnum
        ORDER BY n.nspname, c.relname, a.attnum
      `, [rolename]),

      // RLS policies visible to this role (all RLS-enabled tables, left-joined to matching policies)
      safe<{
        schema_name: string; table_name: string; rls_enabled: boolean; rls_forced: boolean
        policy_name: string | null; command: string | null; permissive: boolean | null
        roles: string[] | null; using_expr: string | null; check_expr: string | null
      }>(`
        ${er}
        SELECT
          n.nspname  AS schema_name,
          c.relname  AS table_name,
          c.relrowsecurity   AS rls_enabled,
          c.relforcerowsecurity AS rls_forced,
          p.polname  AS policy_name,
          CASE p.polcmd
            WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
            WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL'
          END AS command,
          p.polpermissive AS permissive,
          CASE
            WHEN 0::oid = ANY(p.polroles) THEN ARRAY['PUBLIC']
            ELSE ARRAY(SELECT rolname FROM pg_catalog.pg_roles WHERE oid = ANY(p.polroles))
          END AS roles,
          pg_catalog.pg_get_expr(p.polqual,      p.polrelid) AS using_expr,
          pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_catalog.pg_policy p ON p.polrelid = c.oid
          AND EXISTS (SELECT 1 FROM effective_roles er WHERE er.oid = ANY(p.polroles))
        WHERE c.relrowsecurity = true
          AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
        ORDER BY n.nspname, c.relname, p.polname NULLS LAST
      `, [rolename]),

      // Default privileges: what this role will automatically receive on future objects
      safe<{ grantor: string; schema_name: string | null; obj_type: string; privileges: string[] }>(`
        ${er}
        SELECT
          pg_get_userbyid(d.defaclrole) AS grantor,
          n.nspname AS schema_name,
          CASE d.defaclobjtype
            WHEN 'r' THEN 'TABLE'   WHEN 'S' THEN 'SEQUENCE'
            WHEN 'f' THEN 'FUNCTION' WHEN 'T' THEN 'TYPE' WHEN 'n' THEN 'SCHEMA'
            ELSE d.defaclobjtype::text
          END AS obj_type,
          array_agg(DISTINCT acl.privilege_type ORDER BY acl.privilege_type) AS privileges
        FROM pg_catalog.pg_default_acl d
        LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
        CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
        WHERE acl.grantee IN (SELECT oid FROM effective_roles)
        GROUP BY d.defaclrole, n.nspname, d.defaclobjtype
        ORDER BY grantor, obj_type
      `, [rolename]),

      // Session configuration: GUC parameters set for this role via ALTER ROLE ... SET
      safe<{ name: string; value: string; database_name: string | null }>(`
        SELECT
          split_part(cfg, '=', 1)                                   AS name,
          substring(cfg FROM position('=' IN cfg) + 1)              AS value,
          CASE s.setdatabase WHEN 0 THEN NULL
            ELSE (SELECT datname FROM pg_catalog.pg_database WHERE oid = s.setdatabase)
          END AS database_name
        FROM pg_catalog.pg_db_role_setting s
        CROSS JOIN LATERAL unnest(s.setconfig) AS cfg
        WHERE s.setrole = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = $1)
        ORDER BY database_name NULLS FIRST, name
      `, [rolename]),

      // Tablespace access
      safe<{ name: string; owner: string; owner_oid: number; create_priv: boolean }>(`
        ${er}
        SELECT
          t.spcname AS name,
          (SELECT rolname FROM pg_catalog.pg_roles WHERE oid = t.spcowner) AS owner,
          t.spcowner AS owner_oid,
          coalesce(bool_or(a.privilege_type = 'CREATE'), false) AS create_priv
        FROM pg_catalog.pg_tablespace t
        LEFT JOIN LATERAL aclexplode(
          coalesce(t.spcacl, acldefault('t', t.spcowner))
        ) a ON a.grantee IN (SELECT oid FROM effective_roles)
        GROUP BY t.spcname, t.spcowner
        ORDER BY t.spcname
      `, [rolename]),

      // Owned objects — summary of what this role owns (full DDL control = blast radius)
      safe<{ type: string; count: number; examples: string[] }>(`
        WITH role_oid AS (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = $1),
        owned AS (
          SELECT 'TABLE'    AS type, n.nspname||'.'||c.relname AS nm FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace, role_oid
            WHERE c.relkind='r' AND c.relowner=role_oid.oid AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
          UNION ALL
          SELECT 'VIEW',  n.nspname||'.'||c.relname FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace, role_oid
            WHERE c.relkind IN ('v','m') AND c.relowner=role_oid.oid AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
          UNION ALL
          SELECT 'SEQUENCE', n.nspname||'.'||c.relname FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace, role_oid
            WHERE c.relkind='S' AND c.relowner=role_oid.oid AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
          UNION ALL
          SELECT 'SCHEMA', nspname FROM pg_catalog.pg_namespace, role_oid
            WHERE nspowner=role_oid.oid AND nspname NOT IN ('pg_catalog','information_schema','pg_toast')
          UNION ALL
          SELECT 'FUNCTION', n.nspname||'.'||p.proname FROM pg_catalog.pg_proc p
            JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace, role_oid
            WHERE p.proowner=role_oid.oid AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
          UNION ALL
          SELECT 'TYPE', n.nspname||'.'||t.typname FROM pg_catalog.pg_type t
            JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace, role_oid
            WHERE t.typowner=role_oid.oid AND t.typtype IN ('d','e','r','m') AND t.typelem=0
              AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
          UNION ALL
          SELECT 'DATABASE', datname FROM pg_catalog.pg_database, role_oid
            WHERE datdba=role_oid.oid AND NOT datistemplate
        )
        SELECT type, count(*)::int AS count,
          (array_agg(nm ORDER BY nm))[1:5] AS examples
        FROM owned
        GROUP BY type
        ORDER BY type
      `, [rolename]),

      // Role grantees — who has been granted membership IN this role
      safe<{ grantee: string; granted_by: string; admin_option: boolean }>(`
        SELECT
          pg_get_userbyid(m.member)  AS grantee,
          pg_get_userbyid(m.grantor) AS granted_by,
          m.admin_option
        FROM pg_catalog.pg_auth_members m
        JOIN pg_catalog.pg_roles r ON r.oid = m.roleid
        WHERE r.rolname = $1
        ORDER BY grantee
      `, [rolename]),
    ])

  return {
    rolename,
    databases: databases.map((r): DatabasePermission => ({
      oid: r.oid, name: r.name, owner: r.owner, owner_oid: r.owner_oid,
      connect: r.connect, create: r.create_db, temp: r.temp,
    })),
    schemas: schemas.map((r): SchemaPermission => ({
      oid: r.oid, name: r.name, owner: r.owner, owner_oid: r.owner_oid,
      usage: r.usage, create: r.create_schema,
    })),
    tables: tables.map((r): TablePermission => ({
      oid: r.oid, schema: r.schema_name, name: r.name, owner: r.owner, owner_oid: r.owner_oid, kind: r.kind,
      select: r.sel, insert: r.ins, update: r.upd, delete: r.del,
      truncate: r.trunc, references: r.refs, trigger: r.trig,
    })),
    sequences: sequences.map((r): SequencePermission => ({
      oid: r.oid, schema: r.schema_name, name: r.name, owner: r.owner, owner_oid: r.owner_oid,
      usage: r.usage, select: r.sel, update: r.upd,
    })),
    functions: functions.map((r): FunctionPermission => ({
      oid: r.oid, schema: r.schema_name, name: r.name, owner: r.owner, owner_oid: r.owner_oid,
      kind: r.kind, args: r.args, execute: r.execute,
    })),
    types: types.map((r): TypePermission => ({
      oid: r.oid, schema: r.schema_name, name: r.name, owner: r.owner, owner_oid: r.owner_oid,
      kind: r.kind, usage: r.usage,
    })),
    fdws: fdws.map((r): FdwPermission => ({ oid: r.oid, name: r.name, owner: r.owner, owner_oid: r.owner_oid, usage: r.usage })),
    foreignServers: foreignServers.map((r): ForeignServerPermission => ({
      oid: r.oid, name: r.name, owner: r.owner, owner_oid: r.owner_oid, usage: r.usage,
    })),
    columnPrivileges: columnPrivsRaw.map((r): ColumnPrivilege => ({
      schema: r.schema_name, table: r.table_name, column: r.column_name,
      select: r.sel, insert: r.ins, update: r.upd, references: r.refs,
    })),
    rlsPolicies: rlsRaw.map((r): RlsPolicyRow => ({
      schema: r.schema_name, table: r.table_name,
      rlsEnabled: r.rls_enabled, rlsForced: r.rls_forced,
      policyName: r.policy_name, command: r.command, permissive: r.permissive,
      roles: r.roles, usingExpr: r.using_expr, checkExpr: r.check_expr,
    })),
    defaultPrivileges: defaultPrivsRaw.map((r): DefaultPrivilege => ({
      grantor: r.grantor, schema: r.schema_name, objectType: r.obj_type, privileges: r.privileges,
    })),
    configSettings: configRaw.map((r): ConfigSetting => ({
      name: r.name, value: r.value, database: r.database_name,
    })),
    tablespaces: tablespacesRaw.map((r): TablespacePrivilege => ({
      name: r.name, owner: r.owner, owner_oid: r.owner_oid, create: r.create_priv,
    })),
    ownedObjects: ownedRaw.map((r): OwnedObjectGroup => ({
      type: r.type, count: r.count, examples: Array.isArray(r.examples) ? r.examples : [],
    })),
    grantees: granteesRaw.map((r): RoleGrantee => ({
      grantee: r.grantee, grantedBy: r.granted_by, adminOption: r.admin_option,
    })),
  }
}

// ─── Management rights ─────────────────────────────────────────────────────

export interface ManagementRights {
  username: string
  isSuperuser: boolean
  canManageRoles: boolean
  ownsObjects: boolean
  hasGrantOptions: boolean
}

export async function getManagementRights(pool: Pool): Promise<ManagementRights> {
  const { rows } = await pool.query<{
    username: string
    rolsuper: boolean
    rolcreaterole: boolean
    owns_objects: boolean
    has_grant_options: boolean
  }>(`
    SELECT
      current_user AS username,
      r.rolsuper,
      r.rolcreaterole,
      EXISTS (
        SELECT 1 FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relowner = r.oid
          AND c.relkind IN ('r','v','m','f','p')
          AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
        LIMIT 1
      ) AS owns_objects,
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class c
        CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
        WHERE a.grantee = r.oid AND a.is_grantable
        LIMIT 1
      ) AS has_grant_options
    FROM pg_catalog.pg_roles r
    WHERE r.rolname = current_user
  `)
  const row = rows[0]
  return {
    username: row.username,
    isSuperuser: row.rolsuper,
    canManageRoles: row.rolsuper || row.rolcreaterole,
    ownsObjects: row.owns_objects,
    hasGrantOptions: row.has_grant_options,
  }
}

export async function grantRole(pool: Pool, role: string, toRole: string): Promise<void> {
  await pool.query(`GRANT "${role}" TO "${toRole}"`)
}

export async function revokeRole(pool: Pool, role: string, fromRole: string): Promise<void> {
  await pool.query(`REVOKE "${role}" FROM "${fromRole}"`)
}
