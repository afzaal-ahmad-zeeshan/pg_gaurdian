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
  oid: number
  name: string
  owner: string
  owner_oid: number
  connect: boolean
  create: boolean
  temp: boolean
}

export interface SchemaPermission {
  oid: number
  name: string
  owner: string
  owner_oid: number
  usage: boolean
  create: boolean
}

export interface TablePermission {
  oid: number
  schema: string
  name: string
  owner: string
  owner_oid: number
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
  oid: number
  schema: string
  name: string
  owner: string
  owner_oid: number
  usage: boolean
  select: boolean
  update: boolean
}

export interface FunctionPermission {
  oid: number
  schema: string
  name: string
  owner: string
  owner_oid: number
  args: string
  /** f=function p=procedure a=aggregate w=window */
  kind: string
  execute: boolean
}

export interface TypePermission {
  oid: number
  schema: string
  name: string
  owner: string
  owner_oid: number
  /** d=domain e=enum r=range m=multirange b=base */
  kind: string
  usage: boolean
}

export interface FdwPermission {
  oid: number
  name: string
  owner: string
  owner_oid: number
  usage: boolean
}

export interface ForeignServerPermission {
  oid: number
  name: string
  owner: string
  owner_oid: number
  usage: boolean
}

// ─── Extended permissions ──────────────────────────────────────────────────

/** Explicit column-level grant on a specific column */
export interface ColumnPrivilege {
  schema: string
  table: string
  column: string
  select: boolean
  insert: boolean
  update: boolean
  references: boolean
}

/**
 * One row per RLS policy applicable to this role (or null fields when a
 * table has RLS enabled but no policy targets this role — meaning all rows
 * are blocked by default for non-superusers).
 */
export interface RlsPolicyRow {
  schema: string
  table: string
  rlsEnabled: boolean
  rlsForced: boolean
  policyName: string | null
  command: string | null   // ALL | SELECT | INSERT | UPDATE | DELETE
  permissive: boolean | null
  roles: string[] | null   // ['PUBLIC'] or explicit role names
  usingExpr: string | null
  checkExpr: string | null
}

/** Default privilege: what this role will automatically receive on future objects */
export interface DefaultPrivilege {
  grantor: string
  schema: string | null    // null = all schemas
  objectType: string       // TABLE | SEQUENCE | FUNCTION | TYPE | SCHEMA
  privileges: string[]
}

/** Role-level GUC / configuration parameter set via ALTER ROLE ... SET */
export interface ConfigSetting {
  name: string
  value: string
  database: string | null  // null = applies to all databases
}

/** Tablespace access */
export interface TablespacePrivilege {
  name: string
  owner: string
  owner_oid: number
  create: boolean
}

/** Summary of objects owned by this role (ownership = full DDL control) */
export interface OwnedObjectGroup {
  type: string             // TABLE | VIEW | SEQUENCE | SCHEMA | FUNCTION | TYPE | DATABASE
  count: number
  examples: string[]       // first 5 fully-qualified names
}

/** Another role that has been granted membership in THIS role */
export interface RoleGrantee {
  grantee: string
  grantedBy: string
  adminOption: boolean
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
  // Extended
  columnPrivileges: ColumnPrivilege[]
  rlsPolicies: RlsPolicyRow[]
  defaultPrivileges: DefaultPrivilege[]
  configSettings: ConfigSetting[]
  tablespaces: TablespacePrivilege[]
  ownedObjects: OwnedObjectGroup[]
  grantees: RoleGrantee[]
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
