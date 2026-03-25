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
  oid: number
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
  oid: number
  datname: string
  owner: string
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

// ─── Permissions matrix ────────────────────────────────────────────────────

export interface DatabasePermission {
  name: string
  connect: boolean
  create: boolean
  temp: boolean
}

export interface SchemaPermission {
  name: string
  usage: boolean
  create: boolean
}

export interface TablePermission {
  schema: string
  name: string
  /** r=table v=view m=matview f=foreign p=partitioned */
  kind: string
  select: boolean
  insert: boolean
  update: boolean
  delete: boolean
  truncate: boolean
  references: boolean
  trigger: boolean
}

export interface SequencePermission {
  schema: string
  name: string
  usage: boolean
  select: boolean
  update: boolean
}

export interface FunctionPermission {
  schema: string
  name: string
  args: string
  /** f=function p=procedure a=aggregate w=window */
  kind: string
  execute: boolean
}

export interface TypePermission {
  schema: string
  name: string
  /** d=domain e=enum r=range m=multirange b=base */
  kind: string
  usage: boolean
}

export interface FdwPermission {
  name: string
  usage: boolean
}

export interface ForeignServerPermission {
  name: string
  usage: boolean
}

export interface PermissionsMatrix {
  rolename: string
  databases: DatabasePermission[]
  schemas: SchemaPermission[]
  tables: TablePermission[]
  sequences: SequencePermission[]
  functions: FunctionPermission[]
  types: TypePermission[]
  fdws: FdwPermission[]
  foreignServers: ForeignServerPermission[]
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
