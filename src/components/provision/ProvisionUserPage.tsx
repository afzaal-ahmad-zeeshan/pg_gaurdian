'use client'

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Plus, Trash2, ShieldAlert, ShieldX, ShieldCheck,
  CheckCircle2, XCircle, Loader2, UserPlus, Terminal, Copy, Check, Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ServerSelect } from '@/components/ServerSelect'
import { DatabaseSelect } from '@/components/DatabaseSelect'
import { useServerContext } from '@/context/ServerContext'

// ─── Types ────────────────────────────────────────────────────────────────────

type ScopeType = 'database' | 'schema' | 'table' | 'all-tables' | 'all-sequences'

interface ScopeEntry {
  id: string
  type: ScopeType
  database: string
  schema: string
  table: string
  privileges: string[]
}

interface FormState {
  username: string
  password: string
  confirmPassword: string
  connLimit: string
  validUntil: string
  superuser: boolean
  createdb: boolean
  createrole: boolean
  inherit: boolean
  replication: boolean
  bypassrls: boolean
  memberOf: string[]
  scopes: ScopeEntry[]
}

interface ResourceData {
  schemas: { name: string }[]
  tables: { schema: string; name: string; kind: string }[]
  roles: string[]
  databases: string[]
}

interface SecurityWarning {
  severity: 'danger' | 'warning' | 'info'
  title: string
  description: string
}

interface SqlLine {
  comments: { text: string; level: 'normal' | 'warning' | 'danger' }[]
  sql: string
}

interface ExecuteResult {
  ok: boolean
  results?: { sql: string; ok: boolean; error?: string }[]
  rolledBack?: boolean
  error?: string
}

interface ValidateResult {
  ok: boolean
  connectedUser?: string
  isSuperuser?: boolean
  canManageRoles?: boolean
  results?: { sql: string; ok: boolean; error?: string }[]
  error?: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_PRIVS = ['CONNECT', 'CREATE', 'TEMP']
const SCHEMA_PRIVS = ['USAGE', 'CREATE']
const TABLE_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
const SEQ_PRIVS = ['USAGE', 'SELECT', 'UPDATE']

const ROLE_ATTRS: {
  key: keyof Pick<FormState, 'superuser' | 'createdb' | 'createrole' | 'inherit' | 'replication' | 'bypassrls'>
  label: string
  desc: string
  tip: string
  defaultNote: string
}[] = [
  {
    key: 'superuser', label: 'SUPERUSER', desc: 'Bypasses ALL security checks',
    tip: 'A superuser bypasses every access check in PostgreSQL — ACLs, row-level security, object ownership, and system catalog restrictions. They have unrestricted read/write access to all data on the cluster.',
    defaultNote: 'Disabled. Only enable for database administrators who require full cluster control.',
  },
  {
    key: 'createdb', label: 'CREATEDB', desc: 'Can create new databases',
    tip: 'Allows this user to CREATE DATABASE and DROP DATABASE. The user automatically becomes the owner of any database they create, giving them full control over it.',
    defaultNote: 'Disabled. Enable for developers or tooling that needs to provision its own databases.',
  },
  {
    key: 'createrole', label: 'CREATEROLE', desc: 'Can create and drop roles',
    tip: 'Allows this user to create, alter, and drop other roles. Combined with GRANT OPTION, this enables privilege escalation — the user can grant powerful roles to themselves or others.',
    defaultNote: 'Disabled. Avoid unless the account is specifically an IAM/role management service account.',
  },
  {
    key: 'inherit', label: 'INHERIT', desc: 'Inherits role privileges automatically',
    tip: 'When enabled (the default), privileges granted to roles this user is a member of are automatically active without needing to run SET ROLE. When disabled (NOINHERIT), the user must explicitly SET ROLE to assume those privileges.',
    defaultNote: 'Enabled. Keep enabled for normal application users. Disable only for accounts where explicit role switching is a desired security control.',
  },
  {
    key: 'replication', label: 'REPLICATION', desc: 'Can start replication streams',
    tip: 'Allows opening a streaming replication connection and creating replication slots. This exposes the entire WAL stream — every change on the database — which can include sensitive column data. Also needed for logical replication consumers (e.g. pglogical, Debezium).',
    defaultNote: 'Disabled. Only enable for dedicated replication users used by standby servers or change-data-capture pipelines.',
  },
  {
    key: 'bypassrls', label: 'BYPASSRLS', desc: 'Ignores Row Level Security policies',
    tip: 'This user will see and can modify every row in every RLS-protected table, regardless of what the policies say. Multi-tenant isolation, GDPR/HIPAA per-row filters, and any security-label access controls become completely ineffective for this account.',
    defaultNote: 'Disabled. Almost never needed. Only enable for a privileged admin account that explicitly requires unrestricted row access.',
  },
]

// ─── Privilege info ───────────────────────────────────────────────────────────

const PRIV_INFO: Record<string, { tip: string; defaultNote: string }> = {
  // Database
  CONNECT:    { tip: 'Allows the user to connect to this database. Without it, the user cannot open any connection regardless of other privileges.', defaultNote: 'Grant to all application users. Revoke from PUBLIC for locked-down databases.' },
  TEMP:       { tip: 'Allows creating temporary tables and temporary views in this database. Some ORMs and query patterns require temp tables.', defaultNote: 'Grant when the application uses temp tables or complex CTEs that materialise into temp relations.' },
  // Schema
  USAGE:      { tip: 'Allows the user to see objects (tables, functions, views) within this schema and access them. Required before any object-level privilege takes effect.', defaultNote: 'Always grant alongside table privileges. Without this, table grants are silently ignored.' },
  // Table
  SELECT:     { tip: 'Allows reading rows from the table or view. This is the standard read privilege.', defaultNote: 'Grant for all read-only access. The most common privilege for application users.' },
  INSERT:     { tip: 'Allows adding new rows to the table.', defaultNote: 'Grant when the application needs to write new records.' },
  UPDATE:     { tip: 'Allows modifying existing rows. Without SELECT, the user can update rows but cannot read back their values.', defaultNote: 'Usually granted together with SELECT for read-write access.' },
  DELETE:     { tip: 'Allows permanently removing rows that match a WHERE condition. Deleted rows cannot be recovered without a backup or logical-replication undo log.', defaultNote: 'Grant carefully. Prefer soft-delete (UPDATE a deleted_at column) when auditability matters.' },
  TRUNCATE:   { tip: 'Removes all rows from the table instantly with no WHERE clause. Cannot be filtered or undone within the same transaction if autocommit is on. Bypasses per-row triggers.', defaultNote: 'Rarely needed for application users. Prefer DELETE for controlled removal.' },
  REFERENCES: { tip: 'Allows creating a FOREIGN KEY constraint whose referenced column is in this table. Needed when a referencing table is owned by a different user.', defaultNote: 'Rarely granted explicitly. Only needed in cross-owner FK scenarios.' },
  TRIGGER:    { tip: 'Allows defining triggers on this table. Triggers execute arbitrary functions on INSERT, UPDATE, DELETE, or TRUNCATE events — running with the function owner\'s privileges.', defaultNote: 'Rarely needed for application users. Grant only to accounts that manage schema or table behaviour.' },
  // CREATE appears in both DB and schema context — handled below
  CREATE_DB:  { tip: 'Allows creating new schemas within this database.', defaultNote: 'Rarely needed for application users. Enable for DevOps tooling that provisions schemas.' },
  CREATE_SCH: { tip: 'Allows creating new objects (tables, views, functions, sequences) inside this schema. The user becomes owner of anything they create and can drop those objects.', defaultNote: 'Grant only to accounts that manage schema structure (migrations, DDL tooling). Avoid for application runtime users.' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function quoteIdent(s: string): string {
  return '"' + s.replace(/"/g, '""') + '"'
}

function generateSqlLines(form: FormState): SqlLine[] {
  if (!form.username.trim()) return []
  const u = quoteIdent(form.username.trim())
  const lines: SqlLine[] = []

  // BUILD CREATE ROLE attrs
  const attrs: string[] = ['LOGIN']
  if (form.superuser)   attrs.push('SUPERUSER')
  if (form.createdb)    attrs.push('CREATEDB')
  if (form.createrole)  attrs.push('CREATEROLE')
  attrs.push(form.inherit ? 'INHERIT' : 'NOINHERIT')
  if (form.replication) attrs.push('REPLICATION')
  if (form.bypassrls)   attrs.push('BYPASSRLS')
  if (form.password)    attrs.push("PASSWORD '***'")
  const cl = parseInt(form.connLimit)
  if (form.connLimit && !isNaN(cl)) attrs.push(`CONNECTION LIMIT ${cl}`)
  if (form.validUntil)  attrs.push(`VALID UNTIL '${form.validUntil}'`)

  const createComments: SqlLine['comments'] = [
    { text: '-- Creates the new PostgreSQL login account', level: 'normal' },
  ]
  if (form.superuser)
    createComments.push({ text: '-- !! DANGER: SUPERUSER bypasses ALL security — ACLs, RLS, ownership checks, system catalogs', level: 'danger' })
  if (form.bypassrls)
    createComments.push({ text: '-- !! DANGER: BYPASSRLS makes all RLS policies on every table completely ineffective', level: 'danger' })
  if (form.replication)
    createComments.push({ text: '-- !! WARNING: REPLICATION allows streaming ALL WAL data (including sensitive columns) from this server', level: 'warning' })
  if (form.createrole)
    createComments.push({ text: '-- !! WARNING: CREATEROLE enables privilege escalation — this user can create roles and grant membership', level: 'warning' })
  if (!form.password)
    createComments.push({ text: '-- NOTE: No password set — login requires pg_hba.conf trust/peer auth or a later ALTER ROLE', level: 'normal' })

  lines.push({ comments: createComments, sql: `CREATE ROLE ${u} WITH ${attrs.join(' ')};` })

  for (const role of form.memberOf) {
    lines.push({
      comments: [{ text: `-- Grants membership in role "${role}" — this user inherits its privileges`, level: 'normal' }],
      sql: `GRANT ${quoteIdent(role)} TO ${u};`,
    })
  }

  for (const scope of form.scopes) {
    if (scope.type === 'database' && scope.database && scope.privileges.length > 0) {
      const c: SqlLine['comments'] = [{ text: `-- Grants database-level privileges on "${scope.database}": ${scope.privileges.join(', ')}`, level: 'normal' }]
      if (scope.privileges.includes('CREATE'))
        c.push({ text: '-- NOTE: CREATE on a database allows creating new schemas within it', level: 'warning' })
      lines.push({ comments: c, sql: `GRANT ${scope.privileges.join(', ')} ON DATABASE ${quoteIdent(scope.database)} TO ${u};` })
    }

    if (scope.type === 'schema' && scope.schema && scope.privileges.length > 0) {
      const c: SqlLine['comments'] = [{ text: `-- Grants schema-level privileges on "${scope.schema}": ${scope.privileges.join(', ')}`, level: 'normal' }]
      if (scope.privileges.includes('CREATE'))
        c.push({ text: '-- !! WARNING: CREATE on a schema lets this user create objects that may shadow existing ones via search_path', level: 'warning' })
      lines.push({ comments: c, sql: `GRANT ${scope.privileges.join(', ')} ON SCHEMA ${quoteIdent(scope.schema)} TO ${u};` })
    }

    if (scope.type === 'table' && scope.schema && scope.table && scope.privileges.length > 0) {
      const c: SqlLine['comments'] = [{ text: `-- Grants table-level privileges on "${scope.schema}"."${scope.table}": ${scope.privileges.join(', ')}`, level: 'normal' }]
      if (scope.privileges.includes('TRUNCATE'))
        c.push({ text: '-- !! WARNING: TRUNCATE removes ALL rows instantly with no WHERE clause — cannot be filtered', level: 'danger' })
      else if (scope.privileges.includes('DELETE'))
        c.push({ text: '-- NOTE: DELETE allows permanent removal of individual rows', level: 'warning' })
      if (scope.privileges.includes('TRIGGER'))
        c.push({ text: '-- NOTE: TRIGGER allows defining triggers that execute arbitrary functions on table events', level: 'warning' })
      lines.push({ comments: c, sql: `GRANT ${scope.privileges.join(', ')} ON TABLE ${quoteIdent(scope.schema)}.${quoteIdent(scope.table)} TO ${u};` })
    }

    if (scope.type === 'all-tables' && scope.schema && scope.privileges.length > 0) {
      const c: SqlLine['comments'] = [
        { text: `-- Grants on ALL EXISTING tables in schema "${scope.schema}": ${scope.privileges.join(', ')}`, level: 'normal' },
        { text: '-- NOTE: Applies to tables that exist now only. For future tables, use ALTER DEFAULT PRIVILEGES.', level: 'normal' },
      ]
      if (scope.privileges.includes('TRUNCATE'))
        c.push({ text: '-- !! WARNING: TRUNCATE removes ALL rows instantly with no WHERE clause — cannot be filtered', level: 'danger' })
      else if (scope.privileges.includes('DELETE'))
        c.push({ text: '-- NOTE: DELETE allows permanent removal of individual rows', level: 'warning' })
      if (scope.privileges.includes('TRIGGER'))
        c.push({ text: '-- NOTE: TRIGGER allows defining triggers that execute arbitrary functions on table events', level: 'warning' })
      lines.push({ comments: c, sql: `GRANT ${scope.privileges.join(', ')} ON ALL TABLES IN SCHEMA ${quoteIdent(scope.schema)} TO ${u};` })
    }

    if (scope.type === 'all-sequences' && scope.schema && scope.privileges.length > 0) {
      const c: SqlLine['comments'] = [
        { text: `-- Grants on ALL EXISTING sequences in schema "${scope.schema}": ${scope.privileges.join(', ')}`, level: 'normal' },
        { text: '-- NOTE: Applies to sequences that exist now only. For future sequences, use ALTER DEFAULT PRIVILEGES.', level: 'normal' },
      ]
      lines.push({ comments: c, sql: `GRANT ${scope.privileges.join(', ')} ON ALL SEQUENCES IN SCHEMA ${quoteIdent(scope.schema)} TO ${u};` })
    }
  }

  return lines
}

function getExecutionStatements(form: FormState): string[] {
  if (!form.username.trim()) return []
  const u = quoteIdent(form.username.trim())
  const stmts: string[] = []

  const attrs: string[] = ['LOGIN']
  if (form.superuser)   attrs.push('SUPERUSER')
  if (form.createdb)    attrs.push('CREATEDB')
  if (form.createrole)  attrs.push('CREATEROLE')
  attrs.push(form.inherit ? 'INHERIT' : 'NOINHERIT')
  if (form.replication) attrs.push('REPLICATION')
  if (form.bypassrls)   attrs.push('BYPASSRLS')
  if (form.password)    attrs.push(`PASSWORD '${form.password.replace(/'/g, "''")}'`)
  const cl = parseInt(form.connLimit)
  if (form.connLimit && !isNaN(cl)) attrs.push(`CONNECTION LIMIT ${cl}`)
  if (form.validUntil)  attrs.push(`VALID UNTIL '${form.validUntil}'`)

  stmts.push(`CREATE ROLE ${u} WITH ${attrs.join(' ')}`)
  for (const role of form.memberOf) stmts.push(`GRANT ${quoteIdent(role)} TO ${u}`)
  for (const scope of form.scopes) {
    if (scope.type === 'database' && scope.database && scope.privileges.length > 0)
      stmts.push(`GRANT ${scope.privileges.join(', ')} ON DATABASE ${quoteIdent(scope.database)} TO ${u}`)
    if (scope.type === 'schema' && scope.schema && scope.privileges.length > 0)
      stmts.push(`GRANT ${scope.privileges.join(', ')} ON SCHEMA ${quoteIdent(scope.schema)} TO ${u}`)
    if (scope.type === 'table' && scope.schema && scope.table && scope.privileges.length > 0)
      stmts.push(`GRANT ${scope.privileges.join(', ')} ON TABLE ${quoteIdent(scope.schema)}.${quoteIdent(scope.table)} TO ${u}`)
    if (scope.type === 'all-tables' && scope.schema && scope.privileges.length > 0)
      stmts.push(`GRANT ${scope.privileges.join(', ')} ON ALL TABLES IN SCHEMA ${quoteIdent(scope.schema)} TO ${u}`)
    if (scope.type === 'all-sequences' && scope.schema && scope.privileges.length > 0)
      stmts.push(`GRANT ${scope.privileges.join(', ')} ON ALL SEQUENCES IN SCHEMA ${quoteIdent(scope.schema)} TO ${u}`)
  }
  return stmts
}

function analyzeWarnings(form: FormState): SecurityWarning[] {
  const w: SecurityWarning[] = []

  if (form.superuser) w.push({
    severity: 'danger',
    title: 'SUPERUSER: Unrestricted database control',
    description: 'This account bypasses ALL access controls — ACLs, row-level security, and ownership checks. It can read, modify, or destroy any data, drop any object, and directly modify system catalogs. Grant only to fully trusted administrators.',
  })
  if (form.bypassrls) w.push({
    severity: 'danger',
    title: 'BYPASSRLS: Row Level Security completely disabled',
    description: 'This account sees and can modify ALL rows in every RLS-protected table, regardless of any policy. Multi-tenant isolation, HIPAA/GDPR row filtering, and any security-label access control become completely ineffective.',
  })
  if (form.replication) w.push({
    severity: 'warning',
    title: 'REPLICATION: Full WAL stream access',
    description: 'Replication users can open streaming replication connections and create replication slots, exposing every database change as a complete WAL stream — including data in columns that may be considered sensitive or encrypted at the application layer.',
  })
  if (form.createrole) w.push({
    severity: 'warning',
    title: 'CREATEROLE: Privilege escalation vector',
    description: 'A user with CREATEROLE can create new roles and grant membership to anyone. If they also hold GRANT OPTION on privileged roles, they can effectively escalate their own or others\' privileges beyond what was originally intended.',
  })
  if (form.createdb) w.push({
    severity: 'info',
    title: 'CREATEDB: Can create new databases',
    description: 'This user can create new databases and becomes their owner, gaining full control over all objects within those databases.',
  })
  if (!form.inherit) w.push({
    severity: 'info',
    title: 'NOINHERIT: Privileges not automatically applied',
    description: 'With NOINHERIT, privileges from role memberships are not automatically active. The user must explicitly SET ROLE to assume a granted role\'s permissions.',
  })
  if (form.scopes.some(s => s.type === 'schema' && s.privileges.includes('CREATE'))) w.push({
    severity: 'warning',
    title: 'Schema CREATE: Object shadowing risk',
    description: 'CREATE on a schema allows creating objects (tables, functions, views) within it. An object with the same name as an existing one can shadow it when the schema appears early in search_path, potentially redirecting queries.',
  })
  if (form.scopes.some(s => (s.type === 'table' || s.type === 'all-tables') && s.privileges.includes('TRUNCATE'))) w.push({
    severity: 'warning',
    title: 'TRUNCATE: Entire-table data destruction',
    description: 'TRUNCATE removes every row from a table instantly, without a WHERE clause, and bypasses per-row triggers. Ensure proper backup procedures and audit logging are in place before granting this privilege.',
  })
  if (form.scopes.some(s => (s.type === 'table' || s.type === 'all-tables') && s.privileges.includes('TRIGGER'))) w.push({
    severity: 'info',
    title: 'TRIGGER: Arbitrary code on table events',
    description: 'TRIGGER allows defining triggers that execute functions automatically on INSERT, UPDATE, or DELETE. These run with the definer\'s permissions and can perform actions beyond the scope of the triggering statement.',
  })
  if (form.scopes.some(s => s.type === 'all-tables' || s.type === 'all-sequences')) w.push({
    severity: 'info',
    title: 'Bulk grant: existing objects only',
    description: 'GRANT … ON ALL TABLES/SEQUENCES IN SCHEMA applies to relations that exist at the time the statement runs. Objects created after this point will not inherit these privileges. Use ALTER DEFAULT PRIVILEGES to cover future objects.',
  })

  return w
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldInfo({ tip, defaultNote }: { tip: string; defaultNote: string }) {
  return (
    <TooltipProvider delay={150}>
      <Tooltip>
        <TooltipTrigger
          tabIndex={-1}
          className="inline-flex items-center justify-center rounded-full w-4 h-4 text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors cursor-default select-none focus:outline-none"
          aria-label="Field information"
        >
          <Info size={11} />
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-72 p-3 space-y-2">
          <p className="leading-relaxed text-popover-foreground">{tip}</p>
          <div className="border-t border-border/60 pt-2">
            <span className="font-semibold text-popover-foreground">Recommended: </span>
            <span className="text-muted-foreground">{defaultNote}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const COMMENT_CLS: Record<'normal' | 'warning' | 'danger', string> = {
  normal:  'text-muted-foreground',
  warning: 'text-amber-600 dark:text-amber-400',
  danger:  'text-red-600 dark:text-red-400',
}

function SqlPreview({ lines }: { lines: SqlLine[] }) {
  const [copied, setCopied] = useState(false)
  const plainText = lines.map(l => l.comments.map(c => c.text).join('\n') + '\n' + l.sql).join('\n\n')

  function handleCopy() {
    navigator.clipboard.writeText(plainText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (lines.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-muted-foreground italic">
        Enter a username above to see the generated SQL.
      </div>
    )
  }

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? 'Copied' : 'Copy SQL'}
      </button>
      <pre className="rounded-md border border-border bg-black/5 dark:bg-white/5 p-4 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">
        {lines.map((line, i) => (
          <span key={i}>
            {i > 0 && '\n\n'}
            {line.comments.map((c, j) => (
              <span key={j} className={COMMENT_CLS[c.level]}>{c.text}{'\n'}</span>
            ))}
            <span className="text-foreground">{line.sql}</span>
          </span>
        ))}
      </pre>
    </div>
  )
}

const SEVERITY_CLS = {
  danger: {
    wrapper: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30',
    title:   'text-red-700 dark:text-red-400',
    Icon:    ShieldX,
    icon:    'text-red-500',
  },
  warning: {
    wrapper: 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30',
    title:   'text-amber-700 dark:text-amber-400',
    Icon:    ShieldAlert,
    icon:    'text-amber-500',
  },
  info: {
    wrapper: 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30',
    title:   'text-blue-700 dark:text-blue-400',
    Icon:    ShieldCheck,
    icon:    'text-blue-500',
  },
} as const

function WarningCard({ w }: { w: SecurityWarning }) {
  const s = SEVERITY_CLS[w.severity]
  return (
    <div className={`rounded-md border p-3 text-xs space-y-1 ${s.wrapper}`}>
      <div className={`flex items-center gap-1.5 font-semibold ${s.title}`}>
        <s.Icon size={13} className={s.icon} />
        {w.title}
      </div>
      <p className="text-muted-foreground leading-relaxed">{w.description}</p>
    </div>
  )
}

function ScopeRow({
  entry, resources, onUpdate, onRemove,
}: {
  entry: ScopeEntry
  resources: ResourceData
  onUpdate: (id: string, patch: Partial<ScopeEntry>) => void
  onRemove: (id: string) => void
}) {
  const privOptions = entry.type === 'database' ? DB_PRIVS
    : entry.type === 'schema' ? SCHEMA_PRIVS
    : entry.type === 'all-sequences' ? SEQ_PRIVS
    : TABLE_PRIVS
  const filteredTables = resources.tables.filter(t => t.schema === entry.schema)

  function changeType(v: string) {
    onUpdate(entry.id, { type: v as ScopeType, database: '', schema: '', table: '', privileges: [] })
  }

  function togglePriv(priv: string) {
    const next = entry.privileges.includes(priv)
      ? entry.privileges.filter(p => p !== priv)
      : [...entry.privileges, priv]
    onUpdate(entry.id, { privileges: next })
  }

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-lg border border-border bg-muted/10 p-3">
      {/* Scope type */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          Scope
          <FieldInfo
            tip="The level at which to grant privileges. Database → controls connection and schema creation rights. Schema → controls visibility and access to objects within it. Table → controls read/write operations on specific relations."
            defaultNote="Start with Database (CONNECT), then Schema (USAGE), then Table privileges — each layer builds on the previous."
          />
        </span>
        <Select value={entry.type} onValueChange={(v) => v && changeType(v)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="database">Database</SelectItem>
            <SelectItem value="schema">Schema</SelectItem>
            <SelectItem value="table">Table / View</SelectItem>
            <SelectItem value="all-tables">All Tables in Schema</SelectItem>
            <SelectItem value="all-sequences">All Sequences in Schema</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Database target */}
      {entry.type === 'database' && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            Database
            <FieldInfo
              tip="The specific database to grant access on. Database-level privileges (CONNECT, CREATE, TEMP) apply cluster-wide and are checked before any schema or table access."
              defaultNote="Select the database your application connects to. Grant CONNECT as the minimum."
            />
          </span>
          <Select value={entry.database} onValueChange={(v) => v && onUpdate(entry.id, { database: v })}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {resources.databases.map(db => (
                <SelectItem key={db} value={db}>{db}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Schema target */}
      {entry.type === 'schema' && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            Schema
            <FieldInfo
              tip="The schema to grant privileges on. Schema-level grants control whether the user can see and navigate objects within it. USAGE is required before any table or function privileges in this schema take effect."
              defaultNote="Grant USAGE on every schema that contains tables this user should access. Without it, table grants are silently ignored."
            />
          </span>
          <Select value={entry.schema} onValueChange={(v) => v && onUpdate(entry.id, { schema: v })}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {resources.schemas.map(s => (
                <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Bulk schema target (all-tables / all-sequences) */}
      {(entry.type === 'all-tables' || entry.type === 'all-sequences') && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            Schema
            <FieldInfo
              tip={entry.type === 'all-tables'
                ? 'Generates GRANT … ON ALL TABLES IN SCHEMA. Applies to every table, view, materialized view, and foreign table that exists in the schema at the time the statement runs. Objects created afterwards are NOT covered — add ALTER DEFAULT PRIVILEGES for those.'
                : 'Generates GRANT … ON ALL SEQUENCES IN SCHEMA. Applies to every sequence that exists at the time the statement runs. Objects created afterwards are NOT covered — add ALTER DEFAULT PRIVILEGES for those.'}
              defaultNote="You must also grant USAGE on this schema separately so the user can navigate into it."
            />
          </span>
          <Select value={entry.schema} onValueChange={(v) => v && onUpdate(entry.id, { schema: v })}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {resources.schemas.map(s => (
                <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Table: schema + table */}
      {entry.type === 'table' && (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              Schema
              <FieldInfo
                tip="The schema that contains the target table. You must also grant USAGE on this schema (add a separate Schema scope) for the table privilege to be usable."
                defaultNote="Usually 'public' for single-schema apps. Select the schema that owns the target table."
              />
            </span>
            <Select value={entry.schema} onValueChange={(v) => v && onUpdate(entry.id, { schema: v, table: '' })}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {resources.schemas.map(s => (
                  <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              Table / View
              <FieldInfo
                tip="The specific table, view, materialized view, or foreign table to grant access on. Privileges apply only to this relation — not to other tables in the same schema."
                defaultNote="Select the exact table your application queries. Grant SELECT for read-only, SELECT + INSERT + UPDATE for read-write."
              />
            </span>
            {entry.schema ? (
              <Select value={entry.table} onValueChange={(v) => v && onUpdate(entry.id, { table: v })}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {filteredTables.map(t => (
                    <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex h-8 w-48 items-center rounded-lg border border-input px-2.5 text-sm text-muted-foreground">
                Select schema first
              </div>
            )}
          </div>
        </>
      )}

      {/* Privileges */}
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <span className="text-xs text-muted-foreground">Privileges</span>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-1">
          {privOptions.map(priv => {
            // CREATE has different meanings at database vs schema level
            const infoKey = priv === 'CREATE'
              ? (entry.type === 'database' ? 'CREATE_DB' : 'CREATE_SCH')
              : priv
            const info = PRIV_INFO[infoKey]
            return (
              <label key={priv} className="flex items-center gap-1 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={entry.privileges.includes(priv)}
                  onChange={() => togglePriv(priv)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                <span className="font-mono">{priv}</span>
                {info && <FieldInfo tip={info.tip} defaultNote={info.defaultNote} />}
              </label>
            )
          })}
        </div>
      </div>

      {/* Remove */}
      <button
        onClick={() => onRemove(entry.id)}
        className="mt-5 text-muted-foreground hover:text-destructive transition-colors"
        title="Remove scope"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const INIT_FORM: FormState = {
  username: '', password: '', confirmPassword: '',
  connLimit: '', validUntil: '',
  superuser: false, createdb: false, createrole: false,
  inherit: true, replication: false, bypassrls: false,
  memberOf: [], scopes: [],
}

function newScope(): ScopeEntry {
  return { id: crypto.randomUUID(), type: 'database', database: '', schema: '', table: '', privileges: [] }
}

export function ProvisionUserPage() {
  const { servers, selectedId, selected } = useServerContext()
  const [form, setForm] = useState<FormState>(INIT_FORM)
  const [roleToAdd, setRoleToAdd] = useState('')
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null)
  const [validateResult, setValidateResult] = useState<ValidateResult | null>(null)
  const [selectedDb, setSelectedDb] = useState('')

  // Reset database selection on server switch
  useEffect(() => { setSelectedDb(''); setValidateResult(null) }, [selectedId])

  // Schema/table grants are database-specific: connect to the selected database when one is chosen.
  // CREATE ROLE and GRANT ON DATABASE work from any database, so using dbConnection for all is fine.
  const dbConnection = selected && selectedDb ? { ...selected, database: selectedDb } : selected

  const { data: resources, isLoading: resourcesLoading } = useQuery<ResourceData>({
    queryKey: ['provision-resources', selectedId, selectedDb],
    queryFn: () =>
      fetch('/api/pg/provision-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: dbConnection, action: 'resources' }),
      }).then(r => r.json()),
    enabled: !!selected,
  })

  const validateMutation = useMutation({
    mutationFn: async () => {
      const statements = getExecutionStatements(form)
      const res = await fetch('/api/pg/provision-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: dbConnection, action: 'validate', statements }),
      })
      return res.json() as Promise<ValidateResult>
    },
    onSuccess: (data) => setValidateResult(data),
    onError: () => setValidateResult({ ok: false, error: 'Network or server error during validation' }),
  })

  const executeMutation = useMutation({
    mutationFn: async () => {
      const statements = getExecutionStatements(form)
      const res = await fetch('/api/pg/provision-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: dbConnection, action: 'execute', statements }),
      })
      return res.json() as Promise<ExecuteResult>
    },
    onSuccess: (data) => setExecuteResult(data),
    onError: () => setExecuteResult({ ok: false, error: 'Network or server error' }),
  })

  const sqlLines = useMemo(() => generateSqlLines(form), [form])
  const warnings = useMemo(() => analyzeWarnings(form), [form])
  const passwordMismatch = form.confirmPassword.length > 0 && form.password !== form.confirmPassword
  const dangerCount  = warnings.filter(w => w.severity === 'danger').length
  const warningCount = warnings.filter(w => w.severity === 'warning').length
  const canExecute = !!(selected && form.username.trim() && !passwordMismatch && sqlLines.length > 0 && !executeMutation.isPending)
  const availableRoles = (resources?.roles ?? []).filter(r => !form.memberOf.includes(r))

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
    setExecuteResult(null)
    setValidateResult(null)
  }

  function toggleBool(key: 'superuser' | 'createdb' | 'createrole' | 'inherit' | 'replication' | 'bypassrls') {
    setForm(f => ({ ...f, [key]: !f[key] }))
    setExecuteResult(null)
    setValidateResult(null)
  }

  function updateScope(id: string, patch: Partial<ScopeEntry>) {
    setForm(f => ({ ...f, scopes: f.scopes.map(s => s.id === id ? { ...s, ...patch } : s) }))
    setExecuteResult(null)
    setValidateResult(null)
  }

  function removeScope(id: string) {
    setForm(f => ({ ...f, scopes: f.scopes.filter(s => s.id !== id) }))
    setExecuteResult(null)
    setValidateResult(null)
  }

  function handleDbChange(db: string) {
    setSelectedDb(db)
    // Clear schema/table selections in scope entries — they belong to the previous database
    setForm(f => ({
      ...f,
      scopes: f.scopes.map(s =>
        s.type === 'schema' || s.type === 'table' ? { ...s, schema: '', table: '' } : s
      ),
    }))
    setExecuteResult(null)
    setValidateResult(null)
  }

  function addScope() {
    setForm(f => ({ ...f, scopes: [...f.scopes, newScope()] }))
  }

  function addRole() {
    if (roleToAdd && !form.memberOf.includes(roleToAdd)) {
      setField('memberOf', [...form.memberOf, roleToAdd])
      setRoleToAdd('')
    }
  }

  function removeRole(role: string) {
    setField('memberOf', form.memberOf.filter(r => r !== role))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <UserPlus size={22} />
            Provision User
          </h1>
          <p className="text-sm text-muted-foreground">
            Create a new PostgreSQL login with fine-grained access control
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selected && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Database</p>
              <DatabaseSelect
                connection={selected}
                value={selectedDb}
                onChange={handleDbChange}
                placeholder="Default database"
                className="w-44"
              />
            </div>
          )}
          <ServerSelect />
        </div>
      </div>

      {servers.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No servers configured. Add one on the Servers page.
        </p>
      )}

      {selected && resourcesLoading && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Loading server resources…
        </p>
      )}

      {selected && !resourcesLoading && (
        <div className="space-y-4">

          {/* Account Details */}
          <Card>
            <CardHeader>
              <CardTitle>Account Details</CardTitle>
              <CardDescription>Login credentials and connection limits for the new user</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="username" className="flex items-center gap-1">
                    Username <span className="text-destructive">*</span>
                    <FieldInfo
                      tip="The PostgreSQL role name for this account. Role names are case-insensitive and must be unique across all roles and users on the cluster. Allowed characters: letters, digits, underscores, dollar signs."
                      defaultNote="Use a descriptive, lowercase name that reflects the account's purpose and owning team — e.g. app_readonly, reporting_etl, or payments_service."
                    />
                  </Label>
                  <Input
                    id="username"
                    value={form.username}
                    onChange={e => setField('username', e.target.value)}
                    placeholder="e.g. app_readonly"
                    className="font-mono"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="conn-limit" className="flex items-center gap-1">
                    Connection Limit
                    <FieldInfo
                      tip="Maximum number of concurrent connections this role can hold. Helps prevent a single misbehaving user or runaway process from exhausting the server's connection pool. Set to -1 for no limit."
                      defaultNote="Set a reasonable cap — e.g. 10 for an app account, 2 for a reporting account. Leave -1 only for superuser/admin accounts."
                    />
                  </Label>
                  <Input
                    id="conn-limit"
                    type="number"
                    value={form.connLimit}
                    onChange={e => setField('connLimit', e.target.value)}
                    placeholder="-1 (unlimited)"
                    min="-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="flex items-center gap-1">
                    Password
                    <FieldInfo
                      tip="The login password stored as a salted hash (scram-sha-256 by default). Leave blank only when authentication is handled externally via pg_hba.conf (e.g. peer, GSSAPI, or certificate). Blank-password accounts with 'md5' or 'password' auth in pg_hba.conf will be rejected."
                      defaultNote="Always set a strong, randomly generated password for network-accessible accounts. Use a secrets manager rather than a human-memorable password."
                    />
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={e => setField('password', e.target.value)}
                    placeholder="Leave blank for no password"
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password" className="flex items-center gap-1">
                    Confirm Password
                    <FieldInfo
                      tip="Re-enter the password to confirm there are no typos. Both fields must match before the account can be provisioned."
                      defaultNote="Must be identical to the Password field above."
                    />
                  </Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={form.confirmPassword}
                    onChange={e => setField('confirmPassword', e.target.value)}
                    placeholder="Re-enter password"
                    className={passwordMismatch ? 'border-destructive focus-visible:border-destructive' : ''}
                    autoComplete="new-password"
                  />
                  {passwordMismatch && (
                    <p className="text-xs text-destructive">Passwords do not match</p>
                  )}
                </div>
              </div>
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="valid-until" className="flex items-center gap-1">
                  Valid Until
                  <FieldInfo
                    tip="An optional date after which this account's password expires. After expiry, the user cannot log in until the password is reset with ALTER ROLE. The account itself still exists — only the password becomes invalid."
                    defaultNote="Leave blank for permanent accounts. Set an expiry for temporary contractor accounts, CI/CD tokens, or accounts subject to periodic credential rotation policies."
                  />
                </Label>
                <Input
                  id="valid-until"
                  type="date"
                  value={form.validUntil}
                  onChange={e => setField('validUntil', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Role Attributes */}
          <Card>
            <CardHeader>
              <CardTitle>Role Attributes</CardTitle>
              <CardDescription>Capabilities granted at the PostgreSQL role level</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {ROLE_ATTRS.map(({ key, label, desc, tip, defaultNote }) => (
                  <label
                    key={key}
                    className={`flex items-start gap-2.5 rounded-md border p-2.5 cursor-pointer transition-colors ${
                      form[key]
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border hover:bg-muted/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={form[key]}
                      onChange={() => toggleBool(key)}
                      className="mt-0.5 h-3.5 w-3.5 accent-primary"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-semibold flex items-center gap-1">
                        {label}
                        <FieldInfo tip={tip} defaultNote={defaultNote} />
                      </p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Role Memberships */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                Role Memberships
                <FieldInfo
                  tip="Granting membership in a role causes this user to inherit all privileges that role holds (when INHERIT is enabled). This is the recommended pattern: define named roles like 'readonly' or 'app_writer' with the required privileges, then grant users membership instead of granting object privileges directly."
                  defaultNote="Use role membership for shared permission sets. Avoid granting object privileges directly to individual users — it makes auditing and revocation harder."
                />
              </CardTitle>
              <CardDescription>Grant membership in existing roles to inherit their privileges</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Select value={roleToAdd} onValueChange={(v) => v && setRoleToAdd(v)}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Select a role…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={addRole} disabled={!roleToAdd} size="sm" variant="outline">
                  <Plus size={14} className="mr-1" /> Add
                </Button>
              </div>
              {form.memberOf.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {form.memberOf.map(r => (
                    <Badge key={r} variant="secondary" className="gap-1 text-xs font-mono">
                      {r}
                      <button
                        onClick={() => removeRole(r)}
                        className="hover:text-destructive ml-0.5 transition-colors"
                        title={`Remove ${r}`}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No role memberships configured.</p>
              )}
            </CardContent>
          </Card>

          {/* Access Scopes */}
          <Card>
            <CardHeader>
              <CardTitle>Access Scopes</CardTitle>
              <CardDescription>
                Grant privileges on specific databases, schemas, or tables.
                Schema USAGE is required before table privileges take effect.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {form.scopes.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No scopes defined. Click &quot;Add Scope&quot; to grant access to specific resources.
                </p>
              )}
              {form.scopes.map(scope => (
                <ScopeRow
                  key={scope.id}
                  entry={scope}
                  resources={resources ?? { schemas: [], tables: [], roles: [], databases: [] }}
                  onUpdate={updateScope}
                  onRemove={removeScope}
                />
              ))}
              <Button onClick={addScope} size="sm" variant="outline" className="w-full border-dashed">
                <Plus size={14} className="mr-1" /> Add Scope
              </Button>
            </CardContent>
          </Card>

          {/* Generated SQL */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Generated SQL</h2>
              {form.password && sqlLines.length > 0 && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Info size={10} /> Password masked as ***
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Review every statement and its inline comments before executing.
              Comments beginning with <span className="font-mono text-amber-600 dark:text-amber-400">-- !! WARNING</span> or{' '}
              <span className="font-mono text-red-600 dark:text-red-400">-- !! DANGER</span> highlight security implications.
            </p>
            <SqlPreview lines={sqlLines} />
          </div>

          {/* Security Analysis */}
          {warnings.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold">Security Analysis</h2>
                {dangerCount > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {dangerCount} critical
                  </Badge>
                )}
                {warningCount > 0 && (
                  <Badge className="text-xs bg-amber-500 hover:bg-amber-500 text-white">
                    {warningCount} warning{warningCount !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                {warnings.map((w, i) => <WarningCard key={i} w={w} />)}
              </div>
            </div>
          )}

          {/* Execute */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Execute on {selected.name}</p>
                <p className="text-xs text-muted-foreground">
                  Validate to confirm permissions, then execute in a single transaction — all succeed or all roll back.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  onClick={() => { setExecuteResult(null); setValidateResult(null); validateMutation.mutate() }}
                  disabled={!canExecute || validateMutation.isPending || executeMutation.isPending}
                >
                  {validateMutation.isPending
                    ? <><Loader2 size={14} className="animate-spin mr-1.5" />Validating…</>
                    : <><ShieldCheck size={14} className="mr-1.5" />Validate</>}
                </Button>
                <Button
                  onClick={() => { setExecuteResult(null); executeMutation.mutate() }}
                  disabled={!canExecute || !validateResult?.ok || executeMutation.isPending || validateMutation.isPending}
                  variant={dangerCount > 0 ? 'destructive' : 'default'}
                >
                  {executeMutation.isPending
                    ? <><Loader2 size={14} className="animate-spin mr-1.5" />Executing…</>
                    : <><Terminal size={14} className="mr-1.5" />{dangerCount > 0 ? 'Execute (High Risk)' : 'Execute'}</>}
                </Button>
              </div>
            </div>

            {/* Validation results */}
            {validateResult && !executeResult && (
              <div className={`rounded-md border p-3 text-xs space-y-2 ${
                validateResult.ok
                  ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
                  : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
              }`}>
                {validateResult.ok ? (
                  <>
                    <div className="flex items-center gap-1.5 font-semibold text-green-700 dark:text-green-400">
                      <CheckCircle2 size={13} />
                      All {sqlLines.length} statements validated — {validateResult.connectedUser} has permission to execute
                      {validateResult.isSuperuser && (
                        <span className="ml-1 inline-flex items-center rounded border border-green-400 bg-green-200 px-1 text-[10px] text-green-800 dark:bg-green-900 dark:text-green-200">
                          superuser
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground">Review the SQL above, then click Execute to apply.</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 font-semibold text-red-700 dark:text-red-400">
                      <ShieldX size={13} />
                      Validation failed — {validateResult.connectedUser ?? 'connected user'} lacks required permissions
                    </div>
                    {validateResult.results?.map((r, i) => (
                      <div key={i} className="space-y-0.5">
                        <div className="flex items-start gap-1.5">
                          {r.ok
                            ? <CheckCircle2 size={11} className="text-green-500 mt-0.5 shrink-0" />
                            : <XCircle size={11} className="text-red-500 mt-0.5 shrink-0" />}
                          <span className="font-mono break-all">{r.sql}</span>
                        </div>
                        {!r.ok && r.error && (
                          <p className="text-red-600 dark:text-red-400 pl-4 break-all">{r.error}</p>
                        )}
                      </div>
                    ))}
                    {validateResult.error && !validateResult.results && (
                      <p className="text-red-600 dark:text-red-400 font-mono">{validateResult.error}</p>
                    )}
                  </>
                )}
              </div>
            )}

            {executeResult && (
              <div className={`rounded-md border p-3 text-xs space-y-2 ${
                executeResult.ok
                  ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
                  : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
              }`}>
                {executeResult.ok ? (
                  <>
                    <div className="flex items-center gap-1.5 font-semibold text-green-700 dark:text-green-400">
                      <CheckCircle2 size={13} />
                      User &quot;{form.username}&quot; provisioned successfully
                    </div>
                    <div className="space-y-1 mt-1">
                      {executeResult.results?.map((r, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <CheckCircle2 size={11} className="text-green-500 mt-0.5 shrink-0" />
                          <span className="font-mono text-muted-foreground break-all">{r.sql}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5 font-semibold text-red-700 dark:text-red-400">
                      <ShieldX size={13} />
                      Execution failed{executeResult.rolledBack ? ' — all changes rolled back' : ''}
                    </div>
                    {executeResult.results?.map((r, i) => (
                      <div key={i} className="space-y-0.5">
                        <div className="flex items-start gap-1.5">
                          {r.ok
                            ? <CheckCircle2 size={11} className="text-green-500 mt-0.5 shrink-0" />
                            : <ShieldX size={11} className="text-red-500 mt-0.5 shrink-0" />
                          }
                          <span className="font-mono text-muted-foreground break-all">{r.sql}</span>
                        </div>
                        {r.error && (
                          <p className="text-red-600 dark:text-red-400 font-mono ml-4 break-all">{r.error}</p>
                        )}
                      </div>
                    ))}
                    {executeResult.error && !executeResult.results && (
                      <p className="text-red-600 dark:text-red-400 font-mono">{executeResult.error}</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}
