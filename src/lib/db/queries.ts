import { Pool } from 'pg'
import {
  PgRole, PgDatabase, PgPrivilege, PgCurrentUser,
  PermissionsMatrix,
  DatabasePermission, SchemaPermission, TablePermission,
  SequencePermission, FunctionPermission, TypePermission,
  FdwPermission, ForeignServerPermission,
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
  async function safe<T>(sql: string, params: unknown[] = []): Promise<T[]> {
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

  const [databases, schemas, tables, sequences, functions, types, fdws, foreignServers] =
    await Promise.all([

      // Databases – cluster-wide, always fully visible via pg_database
      safe<{ oid: number; name: string; owner: string; connect: boolean; create_db: boolean; temp: boolean }>(`
        ${er}
        SELECT
          d.oid,
          d.datname AS name,
          (SELECT rolname FROM pg_catalog.pg_roles WHERE oid = d.datdba) AS owner,
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
      safe<{ oid: number; name: string; owner: string; usage: boolean; create_schema: boolean }>(`
        ${er}
        SELECT
          n.oid,
          n.nspname AS name,
          (SELECT rolname FROM pg_catalog.pg_roles WHERE oid = n.nspowner) AS owner,
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
        oid: number; schema_name: string; name: string; owner: string; kind: string
        sel: boolean; ins: boolean; upd: boolean; del: boolean
        trunc: boolean; refs: boolean; trig: boolean
      }>(`
        ${er}
        SELECT
          c.oid,
          n.nspname AS schema_name,
          c.relname AS name,
          (SELECT rolname FROM pg_catalog.pg_roles WHERE oid = c.relowner) AS owner,
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
      safe<{ oid: number; schema_name: string; name: string; owner: string; usage: boolean; sel: boolean; upd: boolean }>(`
        ${er}
        SELECT
          c.oid,
          n.nspname AS schema_name,
          c.relname AS name,
          (SELECT rolname FROM pg_catalog.pg_roles WHERE oid = c.relowner) AS owner,
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
      safe<{ oid: number; schema_name: string; name: string; owner: string; kind: string; args: string; execute: boolean }>(`
        ${er}
        SELECT
          p.oid,
          n.nspname AS schema_name,
          p.proname AS name,
          (SELECT rolname FROM pg_catalog.pg_roles WHERE oid = p.proowner) AS owner,
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
      safe<{ oid: number; schema_name: string; name: string; owner: string; kind: string; usage: boolean }>(`
        ${er}
        SELECT
          t.oid,
          n.nspname AS schema_name,
          t.typname AS name,
          (SELECT rolname FROM pg_catalog.pg_roles WHERE oid = t.typowner) AS owner,
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
      safe<{ oid: number; name: string; owner: string; usage: boolean }>(`
        ${er}
        SELECT
          w.oid,
          w.fdwname AS name,
          (SELECT rolname FROM pg_catalog.pg_roles WHERE oid = w.fdwowner) AS owner,
          coalesce(bool_or(a.privilege_type = 'USAGE'), false) AS usage
        FROM pg_catalog.pg_foreign_data_wrapper w
        LEFT JOIN LATERAL aclexplode(
          coalesce(w.fdwacl, acldefault('F', w.fdwowner))
        ) a ON a.grantee IN (SELECT oid FROM effective_roles)
        GROUP BY w.oid, w.fdwname, w.fdwowner
        ORDER BY w.fdwname
      `, [rolename]),

      // Foreign servers
      safe<{ oid: number; name: string; owner: string; usage: boolean }>(`
        ${er}
        SELECT
          s.oid,
          s.srvname AS name,
          (SELECT rolname FROM pg_catalog.pg_roles WHERE oid = s.srvowner) AS owner,
          coalesce(bool_or(a.privilege_type = 'USAGE'), false) AS usage
        FROM pg_catalog.pg_foreign_server s
        LEFT JOIN LATERAL aclexplode(
          coalesce(s.srvacl, acldefault('s', s.srvowner))
        ) a ON a.grantee IN (SELECT oid FROM effective_roles)
        GROUP BY s.oid, s.srvname, s.srvowner
        ORDER BY s.srvname
      `, [rolename]),
    ])

  return {
    rolename,
    databases: databases.map((r): DatabasePermission => ({
      oid: r.oid, name: r.name, owner: r.owner,
      connect: r.connect, create: r.create_db, temp: r.temp,
    })),
    schemas: schemas.map((r): SchemaPermission => ({
      oid: r.oid, name: r.name, owner: r.owner,
      usage: r.usage, create: r.create_schema,
    })),
    tables: tables.map((r): TablePermission => ({
      oid: r.oid, schema: r.schema_name, name: r.name, owner: r.owner, kind: r.kind,
      select: r.sel, insert: r.ins, update: r.upd, delete: r.del,
      truncate: r.trunc, references: r.refs, trigger: r.trig,
    })),
    sequences: sequences.map((r): SequencePermission => ({
      oid: r.oid, schema: r.schema_name, name: r.name, owner: r.owner,
      usage: r.usage, select: r.sel, update: r.upd,
    })),
    functions: functions.map((r): FunctionPermission => ({
      oid: r.oid, schema: r.schema_name, name: r.name, owner: r.owner,
      kind: r.kind, args: r.args, execute: r.execute,
    })),
    types: types.map((r): TypePermission => ({
      oid: r.oid, schema: r.schema_name, name: r.name, owner: r.owner,
      kind: r.kind, usage: r.usage,
    })),
    fdws: fdws.map((r): FdwPermission => ({ oid: r.oid, name: r.name, owner: r.owner, usage: r.usage })),
    foreignServers: foreignServers.map((r): ForeignServerPermission => ({
      oid: r.oid, name: r.name, owner: r.owner, usage: r.usage,
    })),
  }
}

export async function grantRole(pool: Pool, role: string, toRole: string): Promise<void> {
  await pool.query(`GRANT "${role}" TO "${toRole}"`)
}

export async function revokeRole(pool: Pool, role: string, fromRole: string): Promise<void> {
  await pool.query(`REVOKE "${role}" FROM "${fromRole}"`)
}
