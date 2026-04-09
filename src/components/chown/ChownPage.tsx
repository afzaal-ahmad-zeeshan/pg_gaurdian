'use client'
import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Crown, Play, Loader2, CheckCircle2, XCircle, X,
  FolderOpen, Table2, Hash, Code2, Tag, Database,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ServerSelect } from '@/components/ServerSelect'
import { DatabaseSelect } from '@/components/DatabaseSelect'
import { useServerContext } from '@/context/ServerContext'
import type { PgRole } from '@/types'
import type { ChownObjectType } from '@/app/api/pg/chown/route'

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPES: { type: ChownObjectType; label: string; icon: React.ElementType }[] = [
  { type: 'database', label: 'Databases', icon: Database },
  { type: 'schema',   label: 'Schemas',   icon: FolderOpen },
  { type: 'table',    label: 'Tables',    icon: Table2 },
  { type: 'sequence', label: 'Sequences', icon: Hash },
  { type: 'function', label: 'Functions', icon: Code2 },
  { type: 'type',     label: 'Types',     icon: Tag },
]

interface Transfer {
  type: ChownObjectType
  object: string
  currentOwner: string
}

// ─── Object list (one tab's contents) ────────────────────────────────────────

function ObjectList({
  connection,
  type,
  selected,
  onToggle,
  filterOwner,
}: {
  connection: object
  type: ChownObjectType
  selected: Set<string>
  onToggle: (key: string, name: string, owner: string) => void
  filterOwner: string
}) {
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery<{ objects: { name: string; owner: string }[] }>({
    queryKey: ['chown-resources', connection, type],
    queryFn: () =>
      fetch('/api/pg/chown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection, mode: 'resources', type }),
      }).then((r) => r.json()),
    enabled: !!connection,
    staleTime: 30_000,
  })

  const objects = data?.objects ?? []
  const filtered = objects.filter((o) => {
    const matchesSearch = !search || o.name.toLowerCase().includes(search.toLowerCase())
    const matchesOwner = !filterOwner || o.owner === filterOwner
    return matchesSearch && matchesOwner
  })

  if (isLoading) {
    return <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>
  }
  if (!objects.length) {
    return <p className="text-xs text-muted-foreground py-6 text-center">No objects of this type.</p>
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every((o) => selected.has(`${type}:${o.name}`))

  function toggleAll() {
    for (const o of filtered) {
      const key = `${type}:${o.name}`
      if (allFilteredSelected ? selected.has(key) : !selected.has(key)) {
        onToggle(key, o.name, o.owner)
      }
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder="Filter by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm h-8"
        />
        {filtered.length > 0 && (
          <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 text-xs" onClick={toggleAll}>
            {allFilteredSelected ? 'Deselect all' : `Select all (${filtered.length})`}
          </Button>
        )}
      </div>

      <div className="rounded-md border border-border divide-y divide-border max-h-80 overflow-y-auto">
        {filtered.map((o) => {
          const key = `${type}:${o.name}`
          const isChecked = selected.has(key)
          return (
            <label
              key={o.name}
              className={`flex items-center gap-3 px-3 py-2 cursor-pointer text-sm transition-colors hover:bg-muted/40 ${isChecked ? 'bg-primary/5' : ''}`}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggle(key, o.name, o.owner)}
                className="rounded shrink-0"
              />
              <span className="font-mono flex-1 truncate">{o.name}</span>
              <span className="text-xs text-muted-foreground font-mono shrink-0">{o.owner}</span>
            </label>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">No matches.</p>
        )}
      </div>
    </div>
  )
}

// ─── Result ───────────────────────────────────────────────────────────────────

interface ExecResult {
  ok: boolean
  results?: Array<{ type: string; object: string; ok: boolean; error?: string }>
  rolledBack?: boolean
  newOwner?: string
  error?: string
}

function Result({ result, onClear }: { result: ExecResult; onClear: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const succeeded = result.results?.filter((r) => r.ok).length ?? 0
  const failed = result.results?.filter((r) => !r.ok) ?? []

  if (result.ok) {
    return (
      <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/20 p-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
            <CheckCircle2 size={15} />
            <span>
              {succeeded === 1 ? 'Ownership transfer applied.' : `${succeeded} ownership transfers applied.`}
              {result.newOwner && <span className="ml-1 font-mono font-medium"> → {result.newOwner}</span>}
            </span>
          </div>
          <button type="button" onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0">
            Clear
          </button>
        </div>
        {succeeded > 1 && (
          <>
            <button type="button" onClick={() => setExpanded((v) => !v)} className="text-xs text-green-700 dark:text-green-400 underline underline-offset-2 pl-5">
              {expanded ? 'Hide details' : 'Show details'}
            </button>
            {expanded && (
              <div className="pt-1 pl-5 space-y-0.5">
                {result.results!.filter((r) => r.ok).map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs font-mono text-green-800 dark:text-green-300">
                    <Badge variant="outline" className="text-[10px] h-3.5 px-1">{r.type}</Badge>
                    {r.object}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  const failedOp = result.results?.find((r) => !r.ok)
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 p-3 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
          <XCircle size={15} />
          <span>Transfer failed{result.rolledBack ? ' — changes rolled back' : ''}.</span>
        </div>
        <button type="button" onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0">
          Clear
        </button>
      </div>
      {(failedOp?.error ?? result.error) && (
        <p className="text-xs font-mono text-red-600 dark:text-red-400 pl-5 break-all">
          {failedOp?.error ?? result.error}
        </p>
      )}
      {failedOp && (
        <p className="text-xs text-muted-foreground pl-5">
          Failed on: <span className="font-mono">{failedOp.object}</span> ({failedOp.type})
        </p>
      )}
      {failed.length > 1 && (
        <p className="text-xs text-muted-foreground pl-5">{failed.length} objects failed.</p>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ChownPage() {
  const { selected, selectedId } = useServerContext()
  const queryClient = useQueryClient()

  const [activeType, setActiveType] = useState<ChownObjectType>('table')
  const [newOwner, setNewOwner] = useState('')
  const [filterOwner, setFilterOwner] = useState('')
  const [selectedDb, setSelectedDb] = useState('')
  // Map of `type:name` → Transfer
  const [transfers, setTransfers] = useState<Map<string, Transfer>>(new Map())
  const [result, setResult] = useState<ExecResult | null>(null)

  // Reset on server switch
  React.useEffect(() => {
    setTransfers(new Map()); setNewOwner(''); setFilterOwner('')
    setSelectedDb(''); setResult(null)
  }, [selectedId])

  const rolesQuery = useQuery<PgRole[]>({
    queryKey: ['roles', selected],
    queryFn: () =>
      fetch('/api/pg/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: selected }),
      }).then((r) => r.json()),
    enabled: !!selected,
  })
  const roles = rolesQuery.data ?? []

  // Connection scoped to the chosen database — used for execute and for non-database tabs.
  const dbConnection = selected && selectedDb ? { ...selected, database: selectedDb } : selected

  // Object browser: databases are cluster-level; all other types need the db-scoped connection.
  const listConnection = activeType === 'database' ? selected : dbConnection

  function toggle(key: string, name: string, owner: string) {
    setTransfers((prev) => {
      const next = new Map(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        const type = key.split(':')[0] as ChownObjectType
        next.set(key, { type, object: name, currentOwner: owner })
      }
      return next
    })
    setResult(null)
  }

  function removeTransfer(key: string) {
    setTransfers((prev) => { const next = new Map(prev); next.delete(key); return next })
  }

  const selectedKeys = React.useMemo(() => new Set(transfers.keys()), [transfers])
  const transferList = Array.from(transfers.values())
  const canExecute = !!selected && transferList.length > 0 && !!newOwner

  const mutation = useMutation({
    mutationFn: () =>
      fetch('/api/pg/chown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection: dbConnection,
          mode: 'execute',
          transfers: transferList.map(({ type, object }) => ({ type, object })),
          newOwner,
        }),
      }).then((r) => r.json()),
    onSuccess: (data: ExecResult) => {
      setResult(data)
      if (data.ok) {
        setTransfers(new Map())
        queryClient.invalidateQueries({ queryKey: ['chown-resources', selected] })
      }
    },
    onError: (err: Error) => setResult({ ok: false, error: err.message }),
  })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Crown size={22} className="text-muted-foreground" />
            Alter Ownership
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Select objects across any type, then transfer them all to a new owner in one operation.
          </p>
        </div>
        <ServerSelect />
      </div>

      {!selected && (
        <p className="text-sm text-muted-foreground">Select a server to continue.</p>
      )}

      {selected && (
        <div className="space-y-4">
          {/* Controls row */}
          <div className="rounded-lg border border-border p-4 flex flex-wrap items-end gap-4">
            <div className="space-y-1.5 flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Database
              </label>
              <DatabaseSelect
                connection={selected}
                value={selectedDb}
                onChange={(db) => { setSelectedDb(db); setTransfers(new Map()); setResult(null) }}
                placeholder="Default database"
              />
            </div>

            <div className="space-y-1.5 flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Transfer ownership to
              </label>
              <Select value={newOwner} onValueChange={(v) => v && setNewOwner(v)}>
                <SelectTrigger className="font-mono">
                  <SelectValue placeholder="Select new owner…" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.rolname} value={r.rolname}>
                      <span className="font-mono">{r.rolname}</span>
                      {r.rolsuper && (
                        <Badge variant="outline" className="ml-2 text-[10px] h-3.5 px-1 text-amber-600 border-amber-300">superuser</Badge>
                      )}
                      {!r.rolcanlogin && !r.rolsuper && (
                        <Badge variant="outline" className="ml-2 text-[10px] h-3.5 px-1 text-purple-600 border-purple-300">group</Badge>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Show objects owned by
              </label>
              <Select value={filterOwner || '_all_'} onValueChange={(v) => setFilterOwner(!v || v === '_all_' ? '' : v)}>
                <SelectTrigger className="font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all_">Any owner</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.rolname} value={r.rolname}>
                      <span className="font-mono">{r.rolname}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tabbed object browser */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="flex border-b border-border bg-muted/30 overflow-x-auto">
              {TYPES.map(({ type, label, icon: Icon }) => {
                const count = Array.from(transfers.keys()).filter((k) => k.startsWith(type + ':')).length
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setActiveType(type)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                      activeType === type
                        ? 'border-primary text-foreground bg-background'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon size={13} />
                    {label}
                    {count > 0 && (
                      <span className="ml-1 bg-primary text-primary-foreground rounded-full text-[10px] w-4 h-4 flex items-center justify-center leading-none shrink-0">
                        {count > 9 ? '9+' : count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="p-4">
              <ObjectList
                connection={listConnection ?? selected}
                type={activeType}
                selected={selectedKeys}
                onToggle={toggle}
                filterOwner={filterOwner}
              />
            </div>
          </div>

          {/* Selection + apply */}
          {transferList.length > 0 && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {transferList.length} object{transferList.length !== 1 ? 's' : ''} selected
                </p>
                <button
                  type="button"
                  onClick={() => setTransfers(new Map())}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Clear all
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {transferList.map(({ type, object, currentOwner }) => {
                  const key = `${type}:${object}`
                  return (
                    <span key={key} className="inline-flex items-center gap-1.5 bg-muted/60 rounded-md pl-1.5 pr-1 py-0.5 text-xs font-mono">
                      <Badge variant="outline" className="text-[10px] px-1 h-4 font-mono">{type[0].toUpperCase()}</Badge>
                      <span className="truncate max-w-[180px]" title={`${object} (${currentOwner})`}>{object}</span>
                      <button type="button" onClick={() => removeTransfer(key)} className="text-muted-foreground hover:text-foreground ml-0.5">
                        <X size={11} />
                      </button>
                    </span>
                  )
                })}
              </div>

              <div className="flex items-center gap-3 pt-1 border-t border-border">
                <Button
                  onClick={() => mutation.mutate()}
                  disabled={!canExecute || mutation.isPending}
                >
                  {mutation.isPending
                    ? <><Loader2 size={14} className="mr-2 animate-spin" />Applying…</>
                    : <><Play size={14} className="mr-2" />Transfer {transferList.length > 1 ? `${transferList.length} objects` : '1 object'} to {newOwner || '…'}</>}
                </Button>
                {!newOwner && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">Select a new owner first.</p>
                )}
              </div>
            </div>
          )}

          {result && (
            <Result result={result} onClear={() => setResult(null)} />
          )}
        </div>
      )}
    </div>
  )
}
