'use client'
import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Database, FolderOpen, Table2, Hash, Code2, Tag, Globe, Plug,
  UserCog, LucideIcon, ShieldCheck, ShieldAlert, ShieldX, KeyRound,
  Columns, Lock, Star, Settings, Package, Users, Server,
  ChevronDown, ChevronRight,
} from 'lucide-react'
import { SqlQueryButton } from '@/components/SqlQueryButton'
import { DatabaseSelect } from '@/components/DatabaseSelect'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ServerSelect } from '@/components/ServerSelect'
import { useServerContext } from '@/context/ServerContext'
import type {
  PgRole, PermissionsMatrix, PgCurrentUser,
  DatabasePermission, SchemaPermission, TablePermission,
  SequencePermission, FunctionPermission, TypePermission,
  FdwPermission, ForeignServerPermission,
  ColumnPrivilege, RlsPolicyRow, DefaultPrivilege,
  ConfigSetting, TablespacePrivilege, OwnedObjectGroup, RoleGrantee,
} from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Perm({ on }: { on: boolean }) {
  return on
    ? <span className="text-green-500 font-semibold text-sm select-none">✓</span>
    : <span className="text-muted-foreground/30 text-sm select-none">—</span>
}

function KindBadge({ kind, map }: { kind: string; map: Record<string, { label: string; cls: string }> }) {
  const entry = map[kind]
  if (!entry) return null
  return (
    <Badge variant="outline" className={`text-[10px] px-1 py-0 h-4 font-mono ${entry.cls}`}>
      {entry.label}
    </Badge>
  )
}

const TABLE_KIND: Record<string, { label: string; cls: string }> = {
  r: { label: 'TABLE',  cls: 'text-blue-500 border-blue-200' },
  v: { label: 'VIEW',   cls: 'text-violet-500 border-violet-200' },
  m: { label: 'MATVIEW',cls: 'text-purple-500 border-purple-200' },
  f: { label: 'FOREIGN',cls: 'text-orange-500 border-orange-200' },
  p: { label: 'PART.',  cls: 'text-cyan-500 border-cyan-200' },
}

const FUNC_KIND: Record<string, { label: string; cls: string }> = {
  f: { label: 'FN',   cls: 'text-blue-500 border-blue-200' },
  p: { label: 'PROC', cls: 'text-green-500 border-green-200' },
  a: { label: 'AGG',  cls: 'text-yellow-600 border-yellow-200' },
  w: { label: 'WIN',  cls: 'text-purple-500 border-purple-200' },
}

const TYPE_KIND: Record<string, { label: string; cls: string }> = {
  d: { label: 'DOMAIN',     cls: 'text-blue-500 border-blue-200' },
  e: { label: 'ENUM',       cls: 'text-green-500 border-green-200' },
  r: { label: 'RANGE',      cls: 'text-orange-500 border-orange-200' },
  m: { label: 'MULTIRANGE', cls: 'text-purple-500 border-purple-200' },
  b: { label: 'BASE',       cls: 'text-gray-500 border-gray-200' },
}

// ─── Per-section SQL strings ──────────────────────────────────────────────────

const ER = `WITH effective_roles AS (
  SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = $1
  UNION ALL SELECT 0::oid
  UNION ALL
  SELECT m.roleid
  FROM pg_catalog.pg_auth_members m
  JOIN pg_catalog.pg_roles r ON r.oid = m.member AND r.rolname = $1
)`

const SQL_DATABASES = `${ER}
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
ORDER BY d.datname`

const SQL_SCHEMAS = `${ER}
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
ORDER BY n.nspname`

const SQL_TABLES = `${ER}
SELECT
  c.oid,
  n.nspname AS schema_name, c.relname AS name,
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
ORDER BY n.nspname, c.relname`

const SQL_SEQUENCES = `${ER}
SELECT
  c.oid,
  n.nspname AS schema_name, c.relname AS name,
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
ORDER BY n.nspname, c.relname`

const SQL_ROUTINES = `${ER}
SELECT
  p.oid,
  n.nspname AS schema_name, p.proname AS name,
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
ORDER BY n.nspname, p.proname, p.oid`

const SQL_TYPES = `${ER}
SELECT
  t.oid,
  n.nspname AS schema_name, t.typname AS name,
  (SELECT rolname FROM pg_catalog.pg_roles WHERE oid = t.typowner) AS owner,
  t.typtype::text AS kind,
  coalesce(bool_or(a.privilege_type = 'USAGE'), false) AS usage
FROM pg_catalog.pg_type t
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
LEFT JOIN LATERAL aclexplode(
  coalesce(t.typacl, acldefault('T', t.typowner))
) a ON a.grantee IN (SELECT oid FROM effective_roles)
WHERE n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
  AND t.typtype IN ('d','e','r','m') AND t.typelem = 0
GROUP BY t.oid, n.nspname, t.typname, t.typtype, t.typowner
ORDER BY n.nspname, t.typname`

const SQL_FDWS = `${ER}
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
ORDER BY w.fdwname`

const SQL_FOREIGN_SERVERS = `${ER}
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
ORDER BY s.srvname`

const SQL_COLUMN_PRIVS = `-- Column-level grants explicitly set for this role
WITH effective_roles AS (
  SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = $1
  UNION ALL SELECT 0::oid
  UNION ALL SELECT m.roleid FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles r ON r.oid = m.member AND r.rolname = $1
)
SELECT n.nspname AS schema, c.relname AS table, a.attname AS column,
  bool_or(acl.privilege_type='SELECT')     AS select,
  bool_or(acl.privilege_type='INSERT')     AS insert,
  bool_or(acl.privilege_type='UPDATE')     AS update,
  bool_or(acl.privilege_type='REFERENCES') AS references
FROM pg_catalog.pg_attribute a
JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(a.attacl) acl
WHERE a.attacl IS NOT NULL AND a.attnum > 0 AND NOT a.attisdropped
  AND acl.grantee IN (SELECT oid FROM effective_roles)
  AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
GROUP BY n.nspname, c.relname, a.attname, a.attnum
ORDER BY schema, "table", column`

const SQL_RLS = `-- RLS-enabled tables and applicable policies for this role
WITH effective_roles AS (
  SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = $1
  UNION ALL SELECT 0::oid
  UNION ALL SELECT m.roleid FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles r ON r.oid = m.member AND r.rolname = $1
)
SELECT n.nspname AS schema, c.relname AS table,
  c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
  p.polname AS policy, p.polpermissive AS permissive,
  CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END AS command,
  pg_get_expr(p.polqual, p.polrelid) AS using_expr,
  pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_policy p ON p.polrelid = c.oid
  AND EXISTS (SELECT 1 FROM effective_roles er WHERE er.oid = ANY(p.polroles))
WHERE c.relrowsecurity = true
  AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
ORDER BY schema, "table", policy NULLS LAST`

const SQL_DEFAULT_PRIVS = `-- Default privileges: what this role receives on future objects
WITH effective_roles AS (
  SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = $1
  UNION ALL SELECT 0::oid
  UNION ALL SELECT m.roleid FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles r ON r.oid = m.member AND r.rolname = $1
)
SELECT pg_get_userbyid(d.defaclrole) AS grantor, n.nspname AS schema,
  CASE d.defaclobjtype WHEN 'r' THEN 'TABLE' WHEN 'S' THEN 'SEQUENCE'
    WHEN 'f' THEN 'FUNCTION' WHEN 'T' THEN 'TYPE' WHEN 'n' THEN 'SCHEMA'
  END AS object_type,
  array_agg(DISTINCT acl.privilege_type) AS privileges
FROM pg_catalog.pg_default_acl d
LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
WHERE acl.grantee IN (SELECT oid FROM effective_roles)
GROUP BY d.defaclrole, n.nspname, d.defaclobjtype
ORDER BY grantor, object_type`

const SQL_CONFIG = `-- Session configuration set for this role via ALTER ROLE ... SET
SELECT split_part(cfg,'=',1) AS name,
  substring(cfg FROM position('='IN cfg)+1) AS value,
  CASE s.setdatabase WHEN 0 THEN '(all databases)'
    ELSE (SELECT datname FROM pg_catalog.pg_database WHERE oid=s.setdatabase)
  END AS database
FROM pg_catalog.pg_db_role_setting s
CROSS JOIN LATERAL unnest(s.setconfig) AS cfg
WHERE s.setrole = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = $1)
ORDER BY database, name`

const SQL_TABLESPACES = `-- Tablespace access for this role
WITH effective_roles AS (
  SELECT r.oid FROM pg_catalog.pg_roles r WHERE r.rolname = $1
  UNION ALL SELECT 0::oid
  UNION ALL SELECT m.roleid FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles r ON r.oid = m.member AND r.rolname = $1
)
SELECT t.spcname AS tablespace,
  (SELECT rolname FROM pg_roles WHERE oid = t.spcowner) AS owner,
  coalesce(bool_or(a.privilege_type='CREATE'), false) AS create
FROM pg_catalog.pg_tablespace t
LEFT JOIN LATERAL aclexplode(coalesce(t.spcacl, acldefault('t',t.spcowner))) a
  ON a.grantee IN (SELECT oid FROM effective_roles)
GROUP BY t.spcname, t.spcowner ORDER BY tablespace`

const SQL_OWNED = `-- Objects owned by this role (full DDL control)
WITH role_oid AS (SELECT oid FROM pg_roles WHERE rolname = $1)
SELECT 'TABLE'    AS type, n.nspname||'.'||c.relname AS name FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace, role_oid
  WHERE c.relkind='r' AND c.relowner=role_oid.oid AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
UNION ALL
SELECT 'VIEW',  n.nspname||'.'||c.relname FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace, role_oid
  WHERE c.relkind IN ('v','m') AND c.relowner=role_oid.oid AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
UNION ALL SELECT 'SCHEMA', nspname FROM pg_namespace, role_oid WHERE nspowner=role_oid.oid
UNION ALL SELECT 'DATABASE', datname FROM pg_database, role_oid WHERE datdba=role_oid.oid AND NOT datistemplate
ORDER BY type, name`

const SQL_GRANTEES = `-- Roles that have been granted membership in this role
SELECT pg_get_userbyid(m.member)  AS grantee,
       pg_get_userbyid(m.grantor) AS granted_by,
       m.admin_option
FROM pg_auth_members m
JOIN pg_roles r ON r.oid = m.roleid
WHERE r.rolname = $1
ORDER BY grantee`

// ─── Management rights banner ─────────────────────────────────────────────────

interface ManagementRights {
  username: string
  isSuperuser: boolean
  canManageRoles: boolean
  ownsObjects: boolean
  hasGrantOptions: boolean
}

function SqlSnippet({ sql }: { sql: string }) {
  return (
    <pre className="mt-1.5 rounded bg-black/5 dark:bg-white/5 px-2 py-1.5 text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-all">
      {sql}
    </pre>
  )
}

function CapabilityCard({
  icon: Icon,
  label,
  condition,
  allowed,
  grantedExplain,
  deniedExplain,
  fixSql,
}: {
  icon: LucideIcon
  label: string
  condition: string
  allowed: boolean
  grantedExplain: string
  deniedExplain: string
  fixSql?: string
}) {
  return (
    <div
      className={`rounded-md border p-3 text-xs space-y-1.5 ${
        allowed
          ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
          : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <Icon
          size={13}
          className={`shrink-0 ${allowed ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}
        />
        <span className={`font-semibold ${allowed ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
          {label}
        </span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground shrink-0">{condition}</span>
      </div>

      <p className={`leading-relaxed ${allowed ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
        {allowed ? grantedExplain : deniedExplain}
      </p>

      {!allowed && fixSql && <SqlSnippet sql={fixSql} />}
    </div>
  )
}

function ManagementRightsBanner({ rights }: { rights: ManagementRights }) {
  const overallAllowed = rights.canManageRoles || rights.ownsObjects || rights.hasGrantOptions
  const u = rights.username

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      {/* Summary row */}
      <div className="flex items-center gap-2 flex-wrap">
        {rights.isSuperuser ? (
          <ShieldCheck size={15} className="text-green-500 shrink-0" />
        ) : overallAllowed ? (
          <ShieldAlert size={15} className="text-amber-500 shrink-0" />
        ) : (
          <ShieldX size={15} className="text-red-500 shrink-0" />
        )}
        <span className="text-sm font-medium">
          Connected as <span className="font-mono">{u}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          {rights.isSuperuser
            ? '— superuser with full control over all roles and privileges'
            : overallAllowed
            ? '— limited management rights (see details below)'
            : '— read-only access, cannot modify roles or grant privileges'}
        </span>
      </div>

      {/* Capability cards */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <CapabilityCard
          icon={ShieldCheck}
          label="Manage all roles"
          condition="SUPERUSER"
          allowed={rights.isSuperuser}
          grantedExplain={`You can CREATE, ALTER, and DROP any role — including other superusers. You can also bypass row-level security and grant any privilege without restriction.`}
          deniedExplain={`You cannot manage superuser roles or bypass access controls. Only another superuser can perform these operations.`}
          fixSql={`-- Run as an existing superuser:\nALTER ROLE "${u}" SUPERUSER;`}
        />

        <CapabilityCard
          icon={UserCog}
          label="Manage non-superuser roles"
          condition="CREATEROLE"
          allowed={rights.canManageRoles}
          grantedExplain={
            rights.isSuperuser
              ? `Included via SUPERUSER. You can create, alter, and drop any non-superuser role and control role memberships.`
              : `You can CREATE, ALTER, and DROP non-superuser roles, and grant or revoke role memberships. You cannot touch superuser roles.`
          }
          deniedExplain={`You cannot create or modify any roles. You have no ability to grant or revoke role memberships for other users.`}
          fixSql={`-- Run as a superuser:\nALTER ROLE "${u}" CREATEROLE;`}
        />

        <CapabilityCard
          icon={KeyRound}
          label="Grant on owned objects"
          condition="object owner"
          allowed={rights.ownsObjects}
          grantedExplain={`You own at least one table, view, sequence, or other object in this database. As the owner you can GRANT and REVOKE any privilege on those objects to any other role.`}
          deniedExplain={`You do not own any objects in this database, so there is nothing for you to grant access to. You need to own an object before you can control who can use it.`}
          fixSql={`-- Create an object you own, or have an owner transfer one:\nCREATE TABLE my_schema.my_table ( ... );\n-- or (run by current owner / superuser):\nALTER TABLE my_schema.my_table OWNER TO "${u}";`}
        />

        <CapabilityCard
          icon={ShieldAlert}
          label="Re-grant held privileges"
          condition="WITH GRANT OPTION"
          allowed={rights.hasGrantOptions}
          grantedExplain={`At least one of your privileges was granted WITH GRANT OPTION. You can pass that specific privilege on to other roles, but only for the objects where you hold it with this option.`}
          deniedExplain={`None of your current privileges include GRANT OPTION, so you cannot pass any privilege on to other roles — even for things you can do yourself.`}
          fixSql={`-- Run by the object owner or a superuser:\nGRANT SELECT ON my_schema.my_table\n  TO "${u}" WITH GRANT OPTION;`}
        />
      </div>

      {!overallAllowed && (
        <p className="text-xs text-muted-foreground border-t border-border pt-3">
          To grant any management rights to <span className="font-mono">{u}</span>, a superuser must first run one of the <code className="font-mono">ALTER ROLE</code> commands shown above, or transfer object ownership.
        </p>
      )}
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  icon: Icon, title, count, empty, sql, children,
}: {
  icon: LucideIcon
  title: string
  count: number
  empty: string
  sql: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-muted-foreground" />
        <span className="font-medium text-sm">{title}</span>
        <Badge variant="secondary" className="text-xs h-4 px-1.5">{count}</Badge>
        <SqlQueryButton queries={{ sql }} />
      </div>
      {count === 0
        ? <p className="text-xs text-muted-foreground pl-5">{empty}</p>
        : (
          <div className="overflow-x-auto rounded-md border border-border">
            {children}
          </div>
        )}
    </div>
  )
}

// ─── Per-section tables ───────────────────────────────────────────────────────

function OidCell({ oid }: { oid: number }) {
  return (
    <TableCell className="font-mono text-xs text-muted-foreground w-20 shrink-0">{oid}</TableCell>
  )
}

function OwnerCell({ owner, ownerOid }: { owner: string; ownerOid?: number }) {
  return (
    <TableCell className="font-mono text-xs text-muted-foreground">
      {owner}
      {ownerOid !== undefined && (
        <span className="ml-1 text-[10px] text-muted-foreground/50">·{ownerOid}</span>
      )}
    </TableCell>
  )
}

function DatabasesTable({ rows }: { rows: DatabasePermission[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20 text-muted-foreground">OID</TableHead>
          <TableHead className="min-w-40">Database</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead className="text-center w-24">CONNECT</TableHead>
          <TableHead className="text-center w-24">CREATE</TableHead>
          <TableHead className="text-center w-24">TEMP</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.name}>
            <OidCell oid={r.oid} />
            <TableCell className="font-mono text-sm">{r.name}</TableCell>
            <OwnerCell owner={r.owner} ownerOid={r.owner_oid} />
            <TableCell className="text-center"><Perm on={r.connect} /></TableCell>
            <TableCell className="text-center"><Perm on={r.create} /></TableCell>
            <TableCell className="text-center"><Perm on={r.temp} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function SchemasTable({ rows }: { rows: SchemaPermission[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20 text-muted-foreground">OID</TableHead>
          <TableHead className="min-w-40">Schema</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead className="text-center w-24">USAGE</TableHead>
          <TableHead className="text-center w-24">CREATE</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.name}>
            <OidCell oid={r.oid} />
            <TableCell className="font-mono text-sm">{r.name}</TableCell>
            <OwnerCell owner={r.owner} ownerOid={r.owner_oid} />
            <TableCell className="text-center"><Perm on={r.usage} /></TableCell>
            <TableCell className="text-center"><Perm on={r.create} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function TablesTable({ rows }: { rows: TablePermission[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20 text-muted-foreground">OID</TableHead>
          <TableHead className="min-w-48">Object</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead className="text-center w-8 px-1">SELECT</TableHead>
          <TableHead className="text-center w-8 px-1">INSERT</TableHead>
          <TableHead className="text-center w-8 px-1">UPDATE</TableHead>
          <TableHead className="text-center w-8 px-1">DELETE</TableHead>
          <TableHead className="text-center w-8 px-1">TRUNC.</TableHead>
          <TableHead className="text-center w-8 px-1">REF.</TableHead>
          <TableHead className="text-center w-8 px-1">TRIG.</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.schema}.${r.name}`}>
            <OidCell oid={r.oid} />
            <TableCell className="font-mono text-sm">
              <span className="flex items-center gap-1.5 flex-wrap">
                <span>{r.schema}.{r.name}</span>
                <KindBadge kind={r.kind} map={TABLE_KIND} />
              </span>
            </TableCell>
            <OwnerCell owner={r.owner} ownerOid={r.owner_oid} />
            <TableCell className="text-center px-1"><Perm on={r.select} /></TableCell>
            <TableCell className="text-center px-1"><Perm on={r.insert} /></TableCell>
            <TableCell className="text-center px-1"><Perm on={r.update} /></TableCell>
            <TableCell className="text-center px-1"><Perm on={r.delete} /></TableCell>
            <TableCell className="text-center px-1"><Perm on={r.truncate} /></TableCell>
            <TableCell className="text-center px-1"><Perm on={r.references} /></TableCell>
            <TableCell className="text-center px-1"><Perm on={r.trigger} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function SequencesTable({ rows }: { rows: SequencePermission[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20 text-muted-foreground">OID</TableHead>
          <TableHead className="min-w-48">Sequence</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead className="text-center w-24">USAGE</TableHead>
          <TableHead className="text-center w-24">SELECT</TableHead>
          <TableHead className="text-center w-24">UPDATE</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.schema}.${r.name}`}>
            <OidCell oid={r.oid} />
            <TableCell className="font-mono text-sm">{r.schema}.{r.name}</TableCell>
            <OwnerCell owner={r.owner} ownerOid={r.owner_oid} />
            <TableCell className="text-center"><Perm on={r.usage} /></TableCell>
            <TableCell className="text-center"><Perm on={r.select} /></TableCell>
            <TableCell className="text-center"><Perm on={r.update} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function FunctionsTable({ rows }: { rows: FunctionPermission[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20 text-muted-foreground">OID</TableHead>
          <TableHead className="min-w-64">Routine</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead className="text-center w-24">EXECUTE</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.oid}>
            <OidCell oid={r.oid} />
            <TableCell className="font-mono text-sm">
              <span className="flex items-center gap-1.5 flex-wrap">
                <span className="truncate max-w-xs" title={`${r.schema}.${r.name}(${r.args})`}>
                  {r.schema}.{r.name}
                  <span className="text-muted-foreground">({r.args || ''})</span>
                </span>
                <KindBadge kind={r.kind} map={FUNC_KIND} />
              </span>
            </TableCell>
            <OwnerCell owner={r.owner} ownerOid={r.owner_oid} />
            <TableCell className="text-center"><Perm on={r.execute} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function TypesTable({ rows }: { rows: TypePermission[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20 text-muted-foreground">OID</TableHead>
          <TableHead className="min-w-48">Type</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead className="text-center w-24">USAGE</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.schema}.${r.name}`}>
            <OidCell oid={r.oid} />
            <TableCell className="font-mono text-sm">
              <span className="flex items-center gap-1.5 flex-wrap">
                <span>{r.schema}.{r.name}</span>
                <KindBadge kind={r.kind} map={TYPE_KIND} />
              </span>
            </TableCell>
            <OwnerCell owner={r.owner} ownerOid={r.owner_oid} />
            <TableCell className="text-center"><Perm on={r.usage} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function SimpleUsageTable({ rows, nameLabel }: { rows: (FdwPermission | ForeignServerPermission)[]; nameLabel: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20 text-muted-foreground">OID</TableHead>
          <TableHead className="min-w-40">{nameLabel}</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead className="text-center w-24">USAGE</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.name}>
            <OidCell oid={r.oid} />
            <TableCell className="font-mono text-sm">{r.name}</TableCell>
            <OwnerCell owner={r.owner} ownerOid={r.owner_oid} />
            <TableCell className="text-center"><Perm on={r.usage} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function ColumnPrivilegesTable({ rows }: { rows: ColumnPrivilege[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-48">Column</TableHead>
          <TableHead className="text-center w-20">SELECT</TableHead>
          <TableHead className="text-center w-20">INSERT</TableHead>
          <TableHead className="text-center w-20">UPDATE</TableHead>
          <TableHead className="text-center w-24">REF.</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            <TableCell className="font-mono text-sm">
              <span className="text-muted-foreground">{r.schema}.{r.table}.</span>
              <span className="font-semibold">{r.column}</span>
            </TableCell>
            <TableCell className="text-center"><Perm on={r.select} /></TableCell>
            <TableCell className="text-center"><Perm on={r.insert} /></TableCell>
            <TableCell className="text-center"><Perm on={r.update} /></TableCell>
            <TableCell className="text-center"><Perm on={r.references} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function RlsTable({ rows }: { rows: RlsPolicyRow[] }) {
  // Group by schema.table so we can show a sub-header per table
  const byTable = new Map<string, RlsPolicyRow[]>()
  for (const r of rows) {
    const key = `${r.schema}.${r.table}`
    if (!byTable.has(key)) byTable.set(key, [])
    byTable.get(key)!.push(r)
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-52">Table / Policy</TableHead>
          <TableHead className="w-24">Command</TableHead>
          <TableHead className="w-24">Type</TableHead>
          <TableHead>Applies to</TableHead>
          <TableHead className="min-w-40">USING (filter)</TableHead>
          <TableHead className="min-w-40">WITH CHECK</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from(byTable.entries()).map(([tableKey, tableRows]) => {
          const first = tableRows[0]
          return (
            <React.Fragment key={tableKey}>
              {/* Table header row */}
              <TableRow className="bg-muted/30">
                <TableCell colSpan={6} className="py-1.5 font-mono text-sm font-medium">
                  <span className="flex items-center gap-2 flex-wrap">
                    {tableKey}
                    {first.rlsForced && (
                      <Badge variant="outline" className="text-[10px] px-1 h-4 text-amber-600 border-amber-300">
                        FORCE ROW SECURITY
                      </Badge>
                    )}
                  </span>
                </TableCell>
              </TableRow>
              {/* Policy rows */}
              {tableRows.map((r, i) =>
                r.policyName ? (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs pl-8 text-muted-foreground">{r.policyName}</TableCell>
                    <TableCell className="text-xs font-mono">{r.command}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] px-1 h-4 ${r.permissive ? 'text-green-600 border-green-300' : 'text-red-600 border-red-300'}`}>
                        {r.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {(r.roles ?? []).join(', ')}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-48 truncate" title={r.usingExpr ?? ''}>
                      {r.usingExpr ?? <span className="opacity-40">—</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-48 truncate" title={r.checkExpr ?? ''}>
                      {r.checkExpr ?? <span className="opacity-40">—</span>}
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={i} className="text-muted-foreground/60">
                    <TableCell colSpan={6} className="pl-8 text-xs italic">
                      No policies targeting this role — all rows blocked by default for non-superusers
                    </TableCell>
                  </TableRow>
                )
              )}
            </React.Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}

function DefaultPrivilegesTable({ rows }: { rows: DefaultPrivilege[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Grantor</TableHead>
          <TableHead>Schema</TableHead>
          <TableHead>Object type</TableHead>
          <TableHead>Privileges auto-granted on new objects</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            <TableCell className="font-mono text-sm">{r.grantor}</TableCell>
            <TableCell className="font-mono text-sm text-muted-foreground">{r.schema ?? '(all)'}</TableCell>
            <TableCell>
              <Badge variant="secondary" className="text-xs font-mono">{r.objectType}</Badge>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {r.privileges.map(p => (
                  <Badge key={p} variant="outline" className="text-xs font-mono">{p}</Badge>
                ))}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

const SECURITY_SENSITIVE_SETTINGS = new Set([
  'search_path', 'role', 'session_authorization',
  'local_preload_libraries', 'session_preload_libraries',
])

function ConfigTable({ rows }: { rows: ConfigSetting[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-48">Parameter</TableHead>
          <TableHead className="min-w-64">Value</TableHead>
          <TableHead>Database scope</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            <TableCell className="font-mono text-sm flex items-center gap-1.5">
              {r.name}
              {SECURITY_SENSITIVE_SETTINGS.has(r.name) && (
                <Badge variant="outline" className="text-[10px] px-1 h-4 text-amber-600 border-amber-300">
                  security-sensitive
                </Badge>
              )}
            </TableCell>
            <TableCell className="font-mono text-sm text-muted-foreground">{r.value}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{r.database ?? '(all databases)'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function TablespacesTable({ rows }: { rows: TablespacePrivilege[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-40">Tablespace</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead className="text-center w-24">CREATE</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(r => (
          <TableRow key={r.name}>
            <TableCell className="font-mono text-sm">{r.name}</TableCell>
            <OwnerCell owner={r.owner} ownerOid={r.owner_oid} />
            <TableCell className="text-center"><Perm on={r.create} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

const OWNED_ICON: Record<string, string> = {
  TABLE: '🗃', VIEW: '👁', SEQUENCE: '#', SCHEMA: '📁',
  FUNCTION: 'ƒ', TYPE: 'T', DATABASE: '🗄',
}

function OwnedObjectsTable({ rows }: { rows: OwnedObjectGroup[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-28">Type</TableHead>
          <TableHead className="w-20 text-right">Count</TableHead>
          <TableHead>Examples (first 5)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(r => (
          <TableRow key={r.type}>
            <TableCell className="font-mono text-sm">
              <span className="mr-1.5">{OWNED_ICON[r.type] ?? ''}</span>{r.type}
            </TableCell>
            <TableCell className="text-right font-mono text-sm text-muted-foreground">{r.count}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {r.examples.map(e => (
                  <Badge key={e} variant="secondary" className="text-xs font-mono">{e}</Badge>
                ))}
                {r.count > r.examples.length && (
                  <span className="text-xs text-muted-foreground self-center">
                    +{r.count - r.examples.length} more
                  </span>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function GranteesTable({ rows }: { rows: RoleGrantee[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-40">Grantee (member)</TableHead>
          <TableHead>Granted by</TableHead>
          <TableHead className="w-32 text-center">Admin option</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            <TableCell className="font-mono text-sm">{r.grantee}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">{r.grantedBy}</TableCell>
            <TableCell className="text-center">
              <Perm on={r.adminOption} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// ─── Schema tree components ───────────────────────────────────────────────────

function SubSection({
  icon: Icon, title, count, children,
}: {
  icon: LucideIcon; title: string; count: number; children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  if (count === 0) return null
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full text-left py-1.5 group"
      >
        {open
          ? <ChevronDown size={12} className="text-muted-foreground shrink-0" />
          : <ChevronRight size={12} className="text-muted-foreground shrink-0" />}
        <Icon size={12} className="text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <Badge variant="secondary" className="text-[10px] h-3.5 px-1">{count}</Badge>
      </button>
      {open && (
        <div className="ml-4 rounded-md border border-border overflow-x-auto">
          {children}
        </div>
      )}
    </div>
  )
}

function SchemaBlock({
  schema, tables, sequences, functions, types,
}: {
  schema: SchemaPermission
  tables: TablePermission[]
  sequences: SequencePermission[]
  functions: FunctionPermission[]
  types: TypePermission[]
}) {
  const [open, setOpen] = useState(true)
  const total = tables.length + sequences.length + functions.length + types.length

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Schema header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 w-full text-left px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        {open
          ? <ChevronDown size={14} className="text-muted-foreground shrink-0" />
          : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
        <FolderOpen size={14} className="text-muted-foreground shrink-0" />
        <span className="font-mono text-sm font-medium">{schema.name}</span>
        <span className="text-xs text-muted-foreground">
          owner: {schema.owner}
          <span className="ml-1 text-[10px] text-muted-foreground/50">·{schema.owner_oid}</span>
        </span>
        <div className="flex items-center gap-1 ml-1">
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 h-4 font-mono ${schema.usage ? 'text-green-600 border-green-300 dark:text-green-400' : 'text-muted-foreground/50'}`}
          >
            USAGE {schema.usage ? '✓' : '—'}
          </Badge>
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 h-4 font-mono ${schema.create ? 'text-green-600 border-green-300 dark:text-green-400' : 'text-muted-foreground/50'}`}
          >
            CREATE {schema.create ? '✓' : '—'}
          </Badge>
        </div>
        <span className="ml-auto text-xs text-muted-foreground shrink-0">
          {total} object{total !== 1 ? 's' : ''}
        </span>
      </button>

      {/* Schema contents */}
      {open && (
        <div className="px-4 py-3 space-y-2 border-t border-border">
          <SubSection icon={Table2} title="Tables, Views & Materialized Views" count={tables.length}>
            <TablesTable rows={tables} />
          </SubSection>
          <SubSection icon={Hash} title="Sequences" count={sequences.length}>
            <SequencesTable rows={sequences} />
          </SubSection>
          <SubSection icon={Code2} title="Routines" count={functions.length}>
            <FunctionsTable rows={functions} />
          </SubSection>
          <SubSection icon={Tag} title="Types" count={types.length}>
            <TypesTable rows={types} />
          </SubSection>
          {total === 0 && (
            <p className="text-xs text-muted-foreground py-1">No objects in this schema.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Role selection persistence ───────────────────────────────────────────────

const ROLES_KEY = 'pg_guardian_selected_roles'

function loadPersistedRole(serverId: string): string | null {
  if (!serverId || typeof window === 'undefined') return null
  try {
    const map: Record<string, string> = JSON.parse(localStorage.getItem(ROLES_KEY) ?? '{}')
    return map[serverId] ?? null
  } catch { return null }
}

function persistRole(serverId: string, role: string) {
  if (!serverId || typeof window === 'undefined') return
  try {
    const map: Record<string, string> = JSON.parse(localStorage.getItem(ROLES_KEY) ?? '{}')
    map[serverId] = role
    localStorage.setItem(ROLES_KEY, JSON.stringify(map))
  } catch { /* ignore */ }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PermissionsMatrix() {
  const { servers, selectedId, selected } = useServerContext()
  // null = "let the component auto-pick"; string = explicit user choice
  const [userPickedRole, setUserPickedRoleState] = useState<string | null>(null)
  const [selectedDb, setSelectedDb] = useState<string>('')
  const [lastServerId, setLastServerId] = useState('')

  // When selectedId stabilises on mount, or whenever the server changes,
  // restore the persisted role and reset the database to the configured one.
  if (selectedId !== lastServerId) {
    setLastServerId(selectedId)
    setUserPickedRoleState(loadPersistedRole(selectedId))
    setSelectedDb(selected?.database ?? '')
  }

  // On first mount (selectedId may still be '' while ServerContext hydrates).
  // Once it settles to a real value the above block handles it, but we also
  // need to load from localStorage after the initial hydration effect runs.
  useEffect(() => {
    if (selectedId) {
      setUserPickedRoleState(loadPersistedRole(selectedId))
      setSelectedDb(selected?.database ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setUserPickedRole = (role: string) => {
    setUserPickedRoleState(role)
    if (selectedId) persistRole(selectedId, role)
  }

  // Derive a connection that points at the chosen database (same server creds).
  const dbConnection = selected && selectedDb
    ? { ...selected, database: selectedDb }
    : selected ?? null

  // ─ Fetch login roles (cluster-level — always use the original connection)
  const usersQuery = useQuery<{ users: PgRole[]; currentUser: PgCurrentUser }>({
    queryKey: ['users', selectedId],
    queryFn: () =>
      fetch('/api/pg/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: selected }),
      }).then((r) => r.json()),
    enabled: !!selected,
  })

  const users = usersQuery.data?.users ?? []
  // Derive the effective role: explicit pick → first available → nothing
  const selectedRole = userPickedRole ?? users[0]?.rolname ?? ''

  // 3 ─ Fetch permissions matrix for the selected role in the selected database
  const matrixQuery = useQuery<PermissionsMatrix>({
    queryKey: ['permissions', selectedId, selectedRole, selectedDb],
    queryFn: () =>
      fetch('/api/pg/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: dbConnection, rolename: selectedRole }),
      }).then((r) => r.json()),
    enabled: !!dbConnection && !!selectedRole,
  })

  const mx = matrixQuery.data

  // 4 ─ Fetch management rights for the connected user (cluster-level)
  const rightsQuery = useQuery<ManagementRights>({
    queryKey: ['management-rights', selectedId],
    queryFn: () =>
      fetch('/api/pg/management-rights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: selected }),
      }).then((r) => r.json()),
    enabled: !!selected,
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Permissions</h1>
          <p className="text-sm text-muted-foreground">
            Read-only view of all privileges for the selected role across every object in the server.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Database selector */}
          {selected && (
            <div className="flex items-center gap-1.5">
              <Database size={14} className="text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground whitespace-nowrap">Database</span>
              <DatabaseSelect
                connection={selected}
                value={selectedDb}
                onChange={setSelectedDb}
                className="w-40"
              />
            </div>
          )}

          {/* Role selector */}
          {users.length > 0 && (
            <div className="flex items-center gap-1.5">
              <UserCog size={14} className="text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground whitespace-nowrap">Role</span>
              <Select value={selectedRole} onValueChange={(v) => v && setUserPickedRole(v)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select role…">
                    {selectedRole || 'Select role…'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.rolname} value={u.rolname}>
                      <span className="font-mono text-sm">{u.rolname}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <ServerSelect />
        </div>
      </div>

      {/* Management rights banner */}
      {rightsQuery.data && <ManagementRightsBanner rights={rightsQuery.data} />}

      {/* Guard: no servers */}
      {servers.length === 0 && (
        <p className="text-muted-foreground text-sm">No servers configured. Add one on the Servers page.</p>
      )}

      {/* Guard: loading users */}
      {usersQuery.isLoading && (
        <p className="text-muted-foreground text-sm">Loading roles…</p>
      )}

      {/* Guard: no login roles */}
      {!usersQuery.isLoading && !!selected && users.length === 0 && (
        <p className="text-muted-foreground text-sm">No login roles found on this server.</p>
      )}

      {/* Loading matrix */}
      {matrixQuery.isLoading && (
        <p className="text-muted-foreground text-sm">
          Loading permissions for <span className="font-mono">{selectedRole}</span>
          {selectedDb && <> on <span className="font-mono">{selectedDb}</span></>}…
        </p>
      )}

      {/* Error */}
      {matrixQuery.isError && (
        <p className="text-destructive text-sm">Failed to load permissions.</p>
      )}

      {/* Matrix sections */}
      {mx && (
        <div className="space-y-8">
          {/* Summary strip */}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {[
              { label: 'Databases', n: mx.databases.length },
              { label: 'Schemas', n: mx.schemas.length },
              { label: 'Tables & Views', n: mx.tables.length },
              { label: 'Sequences', n: mx.sequences.length },
              { label: 'Routines', n: mx.functions.length },
              { label: 'Types', n: mx.types.length },
              { label: 'FDWs', n: mx.fdws.length },
              { label: 'Foreign Servers', n: mx.foreignServers.length },
              { label: 'Column Grants', n: mx.columnPrivileges.length },
              { label: 'RLS Tables', n: mx.rlsPolicies.length },
              { label: 'Default Privs', n: mx.defaultPrivileges.length },
              { label: 'Config Settings', n: mx.configSettings.length },
              { label: 'Tablespaces', n: mx.tablespaces.length },
              { label: 'Owned Objects', n: mx.ownedObjects.reduce((s, g) => s + g.count, 0) },
              { label: 'Grantees', n: mx.grantees.length },
            ].map(({ label, n }) => (
              <span key={label} className="flex items-center gap-1">
                <span className="font-medium text-foreground">{n}</span> {label}
              </span>
            ))}
          </div>

          {/* ── Databases ── */}
          <Section icon={Database} title="Databases" count={mx.databases.length}
            empty="No databases found." sql={SQL_DATABASES}>
            <DatabasesTable rows={mx.databases} />
          </Section>

          {/* ── Schema tree (schemas → tables / sequences / routines / types) ── */}
          {mx.schemas.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <FolderOpen size={16} className="text-muted-foreground" />
                  <h2 className="font-semibold text-sm">
                    Schemas
                    <Badge variant="secondary" className="ml-2 text-[10px] h-4 px-1.5">
                      {mx.schemas.length}
                    </Badge>
                  </h2>
                  {selectedDb && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">
                      {selectedDb}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    · {mx.tables.length} tables · {mx.sequences.length} sequences
                    · {mx.functions.length} routines · {mx.types.length} types
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <SqlQueryButton queries={[
                    { label: 'Schemas', sql: SQL_SCHEMAS },
                    { label: 'Tables', sql: SQL_TABLES },
                    { label: 'Sequences', sql: SQL_SEQUENCES },
                    { label: 'Routines', sql: SQL_ROUTINES },
                    { label: 'Types', sql: SQL_TYPES },
                  ]} />
                </div>
              </div>

              <div className="space-y-2">
                {mx.schemas.map((schema) => (
                  <SchemaBlock
                    key={schema.oid}
                    schema={schema}
                    tables={mx.tables.filter((t) => t.schema === schema.name)}
                    sequences={mx.sequences.filter((s) => s.schema === schema.name)}
                    functions={mx.functions.filter((f) => f.schema === schema.name)}
                    types={mx.types.filter((t) => t.schema === schema.name)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FolderOpen size={16} />
              <span>No user schemas found.</span>
            </div>
          )}

          {/* ── Foreign Data Wrappers ── */}
          <Section icon={Globe} title="Foreign Data Wrappers"
            count={mx.fdws.length} empty="No foreign data wrappers installed." sql={SQL_FDWS}>
            <SimpleUsageTable rows={mx.fdws} nameLabel="FDW" />
          </Section>

          {/* ── Foreign Servers ── */}
          <Section icon={Plug} title="Foreign Servers"
            count={mx.foreignServers.length} empty="No foreign servers configured." sql={SQL_FOREIGN_SERVERS}>
            <SimpleUsageTable rows={mx.foreignServers} nameLabel="Server" />
          </Section>

          {/* ── Column-level Grants ── */}
          <Section icon={Columns} title="Column-level Grants"
            count={mx.columnPrivileges.length}
            empty="No explicit column-level grants for this role."
            sql={SQL_COLUMN_PRIVS}>
            <ColumnPrivilegesTable rows={mx.columnPrivileges} />
          </Section>

          {/* ── Row Security Policies ── */}
          <Section icon={Lock} title="Row Security Policies"
            count={mx.rlsPolicies.length}
            empty="No tables with row-level security enabled."
            sql={SQL_RLS}>
            <RlsTable rows={mx.rlsPolicies} />
          </Section>

          {/* ── Default Privileges ── */}
          <Section icon={Star} title="Default Privileges"
            count={mx.defaultPrivileges.length}
            empty="No default privilege rules targeting this role."
            sql={SQL_DEFAULT_PRIVS}>
            <DefaultPrivilegesTable rows={mx.defaultPrivileges} />
          </Section>

          {/* ── Configuration Settings ── */}
          <Section icon={Settings} title="Configuration Settings"
            count={mx.configSettings.length}
            empty="No session configuration set for this role via ALTER ROLE … SET."
            sql={SQL_CONFIG}>
            <ConfigTable rows={mx.configSettings} />
          </Section>

          {/* ── Tablespaces ── */}
          <Section icon={Server} title="Tablespace Access"
            count={mx.tablespaces.length}
            empty="No tablespace access granted to this role."
            sql={SQL_TABLESPACES}>
            <TablespacesTable rows={mx.tablespaces} />
          </Section>

          {/* ── Owned Objects ── */}
          <Section icon={Package} title="Owned Objects"
            count={mx.ownedObjects.length}
            empty="This role does not own any objects."
            sql={SQL_OWNED}>
            <OwnedObjectsTable rows={mx.ownedObjects} />
          </Section>

          {/* ── Role Grantees ── */}
          <Section icon={Users} title="Role Grantees (members of this role)"
            count={mx.grantees.length}
            empty="No other roles have been granted membership in this role."
            sql={SQL_GRANTEES}>
            <GranteesTable rows={mx.grantees} />
          </Section>
        </div>
      )}
    </div>
  )
}
