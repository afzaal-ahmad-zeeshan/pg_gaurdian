'use client'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Database, FolderOpen, Table2, Hash, Code2, Tag, Globe, Plug,
  UserCog, LucideIcon,
} from 'lucide-react'
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
  PgRole, PermissionsMatrix,
  DatabasePermission, SchemaPermission, TablePermission,
  SequencePermission, FunctionPermission, TypePermission,
  FdwPermission, ForeignServerPermission,
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

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  icon: Icon, title, count, empty, children,
}: {
  icon: LucideIcon
  title: string
  count: number
  empty: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-muted-foreground" />
        <span className="font-medium text-sm">{title}</span>
        <Badge variant="secondary" className="text-xs h-4 px-1.5">{count}</Badge>
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

function DatabasesTable({ rows }: { rows: DatabasePermission[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="min-w-40">Database</TableHead>
          <TableHead className="text-center w-24">CONNECT</TableHead>
          <TableHead className="text-center w-24">CREATE</TableHead>
          <TableHead className="text-center w-24">TEMP</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.name}>
            <TableCell className="font-mono text-sm">{r.name}</TableCell>
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
          <TableHead className="min-w-40">Schema</TableHead>
          <TableHead className="text-center w-24">USAGE</TableHead>
          <TableHead className="text-center w-24">CREATE</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.name}>
            <TableCell className="font-mono text-sm">{r.name}</TableCell>
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
          <TableHead className="min-w-48">Object</TableHead>
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
            <TableCell className="font-mono text-sm">
              <span className="flex items-center gap-1.5 flex-wrap">
                <span>{r.schema}.{r.name}</span>
                <KindBadge kind={r.kind} map={TABLE_KIND} />
              </span>
            </TableCell>
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
          <TableHead className="min-w-48">Sequence</TableHead>
          <TableHead className="text-center w-24">USAGE</TableHead>
          <TableHead className="text-center w-24">SELECT</TableHead>
          <TableHead className="text-center w-24">UPDATE</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.schema}.${r.name}`}>
            <TableCell className="font-mono text-sm">{r.schema}.{r.name}</TableCell>
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
          <TableHead className="min-w-64">Routine</TableHead>
          <TableHead className="text-center w-24">EXECUTE</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            <TableCell className="font-mono text-sm">
              <span className="flex items-center gap-1.5 flex-wrap">
                <span className="truncate max-w-xs" title={`${r.schema}.${r.name}(${r.args})`}>
                  {r.schema}.{r.name}
                  <span className="text-muted-foreground">({r.args || ''})</span>
                </span>
                <KindBadge kind={r.kind} map={FUNC_KIND} />
              </span>
            </TableCell>
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
          <TableHead className="min-w-48">Type</TableHead>
          <TableHead className="text-center w-24">USAGE</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.schema}.${r.name}`}>
            <TableCell className="font-mono text-sm">
              <span className="flex items-center gap-1.5 flex-wrap">
                <span>{r.schema}.{r.name}</span>
                <KindBadge kind={r.kind} map={TYPE_KIND} />
              </span>
            </TableCell>
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
          <TableHead className="min-w-40">{nameLabel}</TableHead>
          <TableHead className="text-center w-24">USAGE</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.name}>
            <TableCell className="font-mono text-sm">{r.name}</TableCell>
            <TableCell className="text-center"><Perm on={r.usage} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
  const [lastServerId, setLastServerId] = useState('')

  // When selectedId stabilises on mount, or whenever the server changes,
  // restore the persisted role for that server.
  if (selectedId !== lastServerId) {
    setLastServerId(selectedId)
    setUserPickedRoleState(loadPersistedRole(selectedId))
  }

  // On first mount (selectedId may still be '' while ServerContext hydrates).
  // Once it settles to a real value the above block handles it, but we also
  // need to load from localStorage after the initial hydration effect runs.
  useEffect(() => {
    if (selectedId) setUserPickedRoleState(loadPersistedRole(selectedId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setUserPickedRole = (role: string) => {
    setUserPickedRoleState(role)
    if (selectedId) persistRole(selectedId, role)
  }

  // 1 ─ Fetch login roles to populate the user dropdown
  const usersQuery = useQuery<{ users: PgRole[] }>({
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

  // 2 ─ Fetch permissions matrix for the selected role
  const matrixQuery = useQuery<PermissionsMatrix>({
    queryKey: ['permissions', selectedId, selectedRole],
    queryFn: () =>
      fetch('/api/pg/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: selected, rolename: selectedRole }),
      }).then((r) => r.json()),
    enabled: !!selected && !!selectedRole,
  })

  const mx = matrixQuery.data

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
          {/* Role selector */}
          {users.length > 0 && (
            <div className="flex items-center gap-1.5">
              <UserCog size={14} className="text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground whitespace-nowrap">Role</span>
              <Select value={selectedRole} onValueChange={setUserPickedRole}>
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
        <p className="text-muted-foreground text-sm">Loading permissions for <span className="font-mono">{selectedRole}</span>…</p>
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
            ].map(({ label, n }) => (
              <span key={label} className="flex items-center gap-1">
                <span className="font-medium text-foreground">{n}</span> {label}
              </span>
            ))}
          </div>

          {/* ── Databases ── */}
          <Section icon={Database} title="Databases" count={mx.databases.length}
            empty="No databases found.">
            <DatabasesTable rows={mx.databases} />
          </Section>

          {/* ── Schemas ── */}
          <Section icon={FolderOpen} title="Schemas" count={mx.schemas.length}
            empty="No user schemas found.">
            <SchemasTable rows={mx.schemas} />
          </Section>

          {/* ── Tables & Views ── */}
          <Section icon={Table2} title="Tables, Views & Materialized Views"
            count={mx.tables.length} empty="No tables or views found.">
            <TablesTable rows={mx.tables} />
          </Section>

          {/* ── Sequences ── */}
          <Section icon={Hash} title="Sequences" count={mx.sequences.length}
            empty="No sequences found.">
            <SequencesTable rows={mx.sequences} />
          </Section>

          {/* ── Routines ── */}
          <Section icon={Code2} title="Routines (functions, procedures, aggregates)"
            count={mx.functions.length} empty="No user-defined routines found.">
            <FunctionsTable rows={mx.functions} />
          </Section>

          {/* ── Types ── */}
          <Section icon={Tag} title="Types (domains, enums, ranges)"
            count={mx.types.length} empty="No user-defined types found.">
            <TypesTable rows={mx.types} />
          </Section>

          {/* ── Foreign Data Wrappers ── */}
          <Section icon={Globe} title="Foreign Data Wrappers"
            count={mx.fdws.length} empty="No foreign data wrappers installed.">
            <SimpleUsageTable rows={mx.fdws} nameLabel="FDW" />
          </Section>

          {/* ── Foreign Servers ── */}
          <Section icon={Plug} title="Foreign Servers"
            count={mx.foreignServers.length} empty="No foreign servers configured.">
            <SimpleUsageTable rows={mx.foreignServers} nameLabel="Server" />
          </Section>
        </div>
      )}
    </div>
  )
}
