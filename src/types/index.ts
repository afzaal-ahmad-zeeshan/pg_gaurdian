export interface ServerConnection {
  id: string
  name: string
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl?: boolean
}

export interface PgUser {
  usename: string
  usesysid: number
  usecreatedb: boolean
  usesuper: boolean
  userepl: boolean
  usebypassrls: boolean
  passwd: string
  valuntil: string | null
}

export interface PgRole {
  rolname: string
  rolsuper: boolean
  rolinherit: boolean
  rolcreaterole: boolean
  rolcreatedb: boolean
  rolcanlogin: boolean
  rolreplication: boolean
  rolbypassrls: boolean
  rolconnlimit: number
  rolvaliduntil: string | null
  memberof: string[]
}

export interface PgDatabase {
  datname: string
  datdba: number
  datacl: string[] | null
}

export interface PgPrivilege {
  grantee: string
  table_schema: string
  table_name: string
  privilege_type: string
  is_grantable: string
}

export interface PgDbPrivilege {
  datname: string
  canConnect: boolean
  canCreate: boolean
  canTemp: boolean
}

export interface PgCurrentUser {
  username: string
  sessionUser: string
  rolsuper: boolean
  rolinherit: boolean
  rolcreaterole: boolean
  rolcreatedb: boolean
  rolcanlogin: boolean
  rolreplication: boolean
  rolbypassrls: boolean
  rolconnlimit: number
  rolvaliduntil: string | null
  memberof: string[]
  dbPrivileges: PgDbPrivilege[]
}
