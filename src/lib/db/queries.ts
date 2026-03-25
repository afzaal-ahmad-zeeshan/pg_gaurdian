import { Pool } from 'pg'
import { PgRole, PgDatabase, PgPrivilege, PgCurrentUser } from '@/types'

export async function getRoles(pool: Pool): Promise<PgRole[]> {
  const { rows } = await pool.query<PgRole>(`
    SELECT
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
    SELECT datname, datdba, datacl::text[]
    FROM pg_catalog.pg_database
    WHERE datistemplate = false
    ORDER BY datname
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

export async function grantRole(pool: Pool, role: string, toRole: string): Promise<void> {
  await pool.query(`GRANT "${role}" TO "${toRole}"`)
}

export async function revokeRole(pool: Pool, role: string, fromRole: string): Promise<void> {
  await pool.query(`REVOKE "${role}" FROM "${fromRole}"`)
}
