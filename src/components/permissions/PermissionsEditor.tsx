'use client'
import React, { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Database, FolderOpen, Table2, Hash, Code2, Tag, ChevronDown, ChevronRight,
  Play, Loader2, CheckCircle2, XCircle, AlertTriangle, RotateCcw, LucideIcon, ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ServerSelect } from '@/components/ServerSelect'
import { DatabaseSelect } from '@/components/DatabaseSelect'
import { useServerContext } from '@/context/ServerContext'
import { cn } from '@/lib/utils'
import type { PgRole, PermissionsMatrix } from '@/types'
import type { ApplyStatementResult, ValidateResponse } from '@/app/api/pg/permissions-editor/route'

// ─── Privilege lists per object type ─────────────────────────────────────────

const DB_PRIVS    = ['CONNECT', 'CREATE', 'TEMP']
const SCHEMA_PRIVS = ['USAGE', 'CREATE']
const TABLE_PRIVS  = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
const SEQ_PRIVS    = ['USAGE', 'SELECT', 'UPDATE']
const FUNC_PRIVS   = ['EXECUTE']
const TYPE_PRIVS   = ['USAGE']

const TABLE_KIND_LABEL: Record<string, string> = {
  r: 'TABLE', v: 'VIEW', m: 'MATVIEW', f: 'FOREIGN', p: 'PART.',
}
const FUNC_KIND_LABEL: Record<string, string> = {
  f: 'FN', p: 'PROC', a: 'AGG', w: 'WIN',
}

// ─── Permission state helpers ─────────────────────────────────────────────────

// Key format: "type:object:PRIVILEGE"
// Safe because PostgreSQL identifiers cannot contain ':'
function pk(type: string, object: string, priv: string) {
  return `${type}:${object}:${priv}`
}

function parseKey(key: string): { type: string; object: string; privilege: string } {
  const i1 = key.indexOf(':')
  const rest = key.slice(i1 + 1)
  const i2 = rest.lastIndexOf(':')   // last colon = privilege separator
  return { type: key.slice(0, i1), object: rest.slice(0, i2), privilege: rest.slice(i2 + 1) }
}

function matrixToState(mx: PermissionsMatrix): Map<string, boolean> {
  const s = new Map<string, boolean>()

  for (const db of mx.databases) {
    s.set(pk('database', db.name, 'CONNECT'), db.connect)
    s.set(pk('database', db.name, 'CREATE'),  db.create)
    s.set(pk('database', db.name, 'TEMP'),    db.temp)
  }
  for (const schema of mx.schemas) {
    s.set(pk('schema', schema.name, 'USAGE'),  schema.usage)
    s.set(pk('schema', schema.name, 'CREATE'), schema.create)
  }
  for (const t of mx.tables) {
    const obj = `${t.schema}.${t.name}`
    s.set(pk('table', obj, 'SELECT'),     t.select)
    s.set(pk('table', obj, 'INSERT'),     t.insert)
    s.set(pk('table', obj, 'UPDATE'),     t.update)
    s.set(pk('table', obj, 'DELETE'),     t.delete)
    s.set(pk('table', obj, 'TRUNCATE'),   t.truncate)
    s.set(pk('table', obj, 'REFERENCES'), t.references)
    s.set(pk('table', obj, 'TRIGGER'),    t.trigger)
  }
  for (const seq of mx.sequences) {
    const obj = `${seq.schema}.${seq.name}`
    s.set(pk('sequence', obj, 'USAGE'),  seq.usage)
    s.set(pk('sequence', obj, 'SELECT'), seq.select)
    s.set(pk('sequence', obj, 'UPDATE'), seq.update)
  }
  for (const fn of mx.functions) {
    const obj = `${fn.schema}.${fn.name}(${fn.args})`
    s.set(pk('function', obj, 'EXECUTE'), fn.execute)
  }
  for (const ty of mx.types) {
    const obj = `${ty.schema}.${ty.name}`
    s.set(pk('type', obj, 'USAGE'), ty.usage)
  }

  return s
}

// ─── SQL statement builder ────────────────────────────────────────────────────

function qi(s: string) { return `"${s.replace(/"/g, '""')}"` }

function buildStatement(type: string, object: string, privilege: string, grant: boolean, role: string): string {
  let objSql: string
  switch (type) {
    case 'database': objSql = `ON DATABASE ${qi(object)}`; break
    case 'schema':   objSql = `ON SCHEMA ${qi(object)}`; break
    case 'table': {
      const d = object.indexOf('.')
      objSql = `ON TABLE ${qi(object.slice(0, d))}.${qi(object.slice(d + 1))}`; break
    }
    case 'sequence': {
      const d = object.indexOf('.')
      objSql = `ON SEQUENCE ${qi(object.slice(0, d))}.${qi(object.slice(d + 1))}`; break
    }
    case 'function': {
      const d = object.indexOf('.')
      const p = object.indexOf('(')
      objSql = `ON FUNCTION ${qi(object.slice(0, d))}.${qi(object.slice(d + 1, p))}${object.slice(p)}`; break
    }
    case 'type': {
      const d = object.indexOf('.')
      objSql = `ON TYPE ${qi(object.slice(0, d))}.${qi(object.slice(d + 1))}`; break
    }
    default: return ''
  }
  return grant
    ? `GRANT ${privilege} ${objSql} TO ${qi(role)}`
    : `REVOKE ${privilege} ${objSql} FROM ${qi(role)}`
}

// ─── PermSection ──────────────────────────────────────────────────────────────

interface PermRow {
  rowKey: string    // "type:object" prefix (without :PRIVILEGE)
  label: string
  badge?: string
}

function PermSection({
  title, icon: Icon, rows, privileges, permState, origState, onToggle,
}: {
  title: string
  icon: LucideIcon
  rows: PermRow[]
  privileges: string[]
  permState: Map<string, boolean>
  origState: Map<string, boolean>
  onToggle: (fullKey: string) => void
}) {
  const [open, setOpen] = useState(true)

  if (rows.length === 0) return null

  // Count cells changed in this section
  const changedCount = rows.reduce((acc, row) => (
    acc + privileges.filter((p) => {
      const k = `${row.rowKey}:${p}`
      return permState.get(k) !== origState.get(k)
    }).length
  ), 0)

  // Toggle all privileges for a single row
  function toggleRow(row: PermRow, grantAll: boolean) {
    privileges.forEach((p) => {
      const k = `${row.rowKey}:${p}`
      if ((permState.get(k) ?? false) !== grantAll) onToggle(k)
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left py-2 group"
      >
        {open
          ? <ChevronDown size={14} className="text-muted-foreground shrink-0" />
          : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
        <Icon size={14} className="text-muted-foreground shrink-0" />
        <span className="font-medium text-sm">{title}</span>
        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{rows.length}</Badge>
        {changedCount > 0 && (
          <Badge className="text-[10px] h-4 px-1.5 bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300">
            {changedCount} pending
          </Badge>
        )}
      </button>

      {open && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted/40">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap sticky left-0 bg-muted/40 z-10 min-w-[180px]">
                  Object
                </th>
                {privileges.map((p) => (
                  <th key={p} className="px-2 py-2 font-medium text-muted-foreground whitespace-nowrap text-center min-w-[60px]">
                    {p}
                  </th>
                ))}
                <th className="px-2 py-2 text-muted-foreground whitespace-nowrap text-center w-16">
                  Quick
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const rowChanged = privileges.some((p) => {
                  const k = `${row.rowKey}:${p}`
                  return permState.get(k) !== origState.get(k)
                })
                return (
                  <tr
                    key={row.rowKey}
                    className={cn(
                      'border-t border-border/50',
                      i % 2 === 0 ? 'bg-background' : 'bg-muted/10',
                      rowChanged && 'bg-amber-50/50 dark:bg-amber-950/10',
                    )}
                  >
                    <td className={cn(
                      'px-3 py-1.5 sticky left-0 z-10 font-mono',
                      i % 2 === 0 ? 'bg-background' : 'bg-muted/10',
                      rowChanged && 'bg-amber-50/50 dark:bg-amber-950/10',
                    )}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate max-w-[240px]" title={row.label}>{row.label}</span>
                        {row.badge && (
                          <Badge variant="outline" className="text-[10px] px-1 h-3.5 shrink-0 font-mono">
                            {row.badge}
                          </Badge>
                        )}
                      </div>
                    </td>
                    {privileges.map((p) => {
                      const k = `${row.rowKey}:${p}`
                      const current = permState.get(k) ?? false
                      const original = origState.get(k) ?? false
                      const changed = current !== original
                      return (
                        <td key={p} className="text-center px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={current}
                            onChange={() => onToggle(k)}
                            title={`${changed ? (current ? 'Will GRANT' : 'Will REVOKE') : (current ? 'Granted' : 'Not granted')}: ${p}`}
                            className={cn(
                              'w-3.5 h-3.5 cursor-pointer rounded accent-primary',
                              changed && 'ring-2 ring-amber-400 ring-offset-1',
                            )}
                          />
                        </td>
                      )
                    })}
                    {/* Quick row actions */}
                    <td className="text-center px-2 py-1.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          title="Grant all privileges for this object"
                          onClick={() => toggleRow(row, true)}
                          className="text-[10px] text-green-600 dark:text-green-400 hover:underline leading-none"
                        >
                          ALL
                        </button>
                        <span className="text-muted-foreground/50">·</span>
                        <button
                          type="button"
                          title="Revoke all privileges for this object"
                          onClick={() => toggleRow(row, false)}
                          className="text-[10px] text-red-600 dark:text-red-400 hover:underline leading-none"
                        >
                          NONE
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Pending changes bar ──────────────────────────────────────────────────────

interface Change {
  type: string
  object: string
  privilege: string
  grant: boolean
  /** false = connected user is not superuser and doesn't own this object */
  canGrant: boolean
}

function PendingBar({
  changes, role, connectedUser, isSuperuser, onApply, onDiscard, isPending,
  validateResult, onValidate, isValidating,
}: {
  changes: Change[]
  role: string
  connectedUser: string
  isSuperuser: boolean
  onApply: () => void
  onDiscard: () => void
  isPending: boolean
  validateResult: ValidateResponse | null
  onValidate: () => void
  isValidating: boolean
}) {
  const [showSql, setShowSql] = useState(false)
  const [showValidateDetail, setShowValidateDetail] = useState(false)
  const grants = changes.filter((c) => c.grant).length
  const revokes = changes.filter((c) => !c.grant).length
  const riskyCount = changes.filter((c) => !c.canGrant).length

  const statements = changes.map((c) => {
    const sql = buildStatement(c.type, c.object, c.privilege, c.grant, role)
    return c.canGrant ? sql : `${sql}  -- ⚠ may have no effect (not owner / no GRANT OPTION)`
  })

  const willApplyCount = validateResult ? validateResult.results.filter((r) => r.ok).length : null
  const willFailCount  = validateResult ? validateResult.results.filter((r) => !r.ok).length : null

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3">
      {/* Title row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {changes.length} pending change{changes.length !== 1 ? 's' : ''}
          </span>
          <span className="text-xs text-amber-700 dark:text-amber-400">
            {grants > 0 && <span className="text-green-700 dark:text-green-400 font-medium">{grants} GRANT{grants !== 1 ? 'S' : ''}</span>}
            {grants > 0 && revokes > 0 && <span className="mx-1 text-amber-400">·</span>}
            {revokes > 0 && <span className="text-red-700 dark:text-red-400 font-medium">{revokes} REVOKE{revokes !== 1 ? 'S' : ''}</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSql((v) => !v)}
            className="text-xs text-amber-700 dark:text-amber-400 underline underline-offset-2"
          >
            {showSql ? 'Hide SQL' : 'Preview SQL'}
          </button>
          <Button
            variant="outline" size="sm"
            onClick={onDiscard}
            disabled={isPending || isValidating}
            className="h-7 text-xs"
          >
            <RotateCcw size={11} className="mr-1" /> Discard
          </Button>
          {!validateResult ? (
            <Button size="sm" onClick={onValidate} disabled={isValidating || isPending} className="h-7 text-xs">
              {isValidating
                ? <><Loader2 size={11} className="mr-1 animate-spin" />Validating…</>
                : <><ShieldCheck size={11} className="mr-1" />Validate Changes</>}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onApply}
              disabled={isPending || willApplyCount === 0}
              className="h-7 text-xs"
            >
              {isPending
                ? <><Loader2 size={11} className="mr-1 animate-spin" />Applying…</>
                : willFailCount! > 0
                  ? <><Play size={11} className="mr-1" />Apply {willApplyCount} of {changes.length}</>
                  : <><Play size={11} className="mr-1" />Apply {changes.length} change{changes.length !== 1 ? 's' : ''}</>}
            </Button>
          )}
        </div>
      </div>

      {/* Executor identity + pre-validate privilege warning */}
      <div className="flex items-start gap-2 flex-wrap">
        <span className="text-xs text-amber-700 dark:text-amber-400">
          Executing as{' '}
          <span className="font-mono font-medium">{connectedUser}</span>
          {isSuperuser && (
            <Badge className="ml-1.5 text-[10px] h-3.5 px-1 bg-amber-200 text-amber-800 border-amber-400 dark:bg-amber-900 dark:text-amber-200">
              superuser
            </Badge>
          )}
        </span>
        {!validateResult && riskyCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-red-700 dark:text-red-400">
            <XCircle size={12} className="shrink-0" />
            {riskyCount} statement{riskyCount !== 1 ? 's' : ''} may have no effect —{' '}
            <span className="font-mono font-medium">{connectedUser}</span> is not the object owner and may lack GRANT OPTION
          </span>
        )}
      </div>

      {/* Validation results panel */}
      {validateResult && (
        <div className={cn(
          'rounded-md border p-3 space-y-2 text-xs',
          willFailCount === 0
            ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20'
            : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20',
        )}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              {willFailCount === 0
                ? <CheckCircle2 size={13} className="text-green-600 dark:text-green-400 shrink-0" />
                : <XCircle size={13} className="text-red-600 dark:text-red-400 shrink-0" />}
              <span className={cn(
                'font-medium',
                willFailCount === 0
                  ? 'text-green-700 dark:text-green-300'
                  : 'text-red-700 dark:text-red-300',
              )}>
                {willFailCount === 0
                  ? `All ${willApplyCount} change${willApplyCount !== 1 ? 's' : ''} will apply — ${connectedUser} has permission`
                  : `${willApplyCount} will apply · ${willFailCount} will have no effect`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowValidateDetail((v) => !v)}
              className="text-muted-foreground underline underline-offset-2 shrink-0"
            >
              {showValidateDetail ? 'Hide' : 'Show'} details
            </button>
          </div>

          {showValidateDetail && (
            <div className="space-y-1.5 pt-1">
              {validateResult.results.map((r, i) => (
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
            </div>
          )}
        </div>
      )}

      {showSql && (
        <pre className="rounded bg-muted/60 border border-border px-3 py-2.5 text-xs font-mono overflow-x-auto max-h-48">
          {statements.join('\n')}
        </pre>
      )}
    </div>
  )
}

// ─── Apply results ────────────────────────────────────────────────────────────

function ApplyResults({
  results, total, onDismiss,
}: {
  results: ApplyStatementResult[]
  total: number
  onDismiss: () => void
}) {
  const [showAll, setShowAll] = useState(false)
  const succeeded = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok)
  const allOk = failed.length === 0

  return (
    <div className={cn(
      'rounded-lg border p-4 space-y-3',
      allOk
        ? 'border-green-300 bg-green-50 dark:bg-green-950/20'
        : 'border-amber-300 bg-amber-50 dark:bg-amber-950/20',
    )}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {allOk
            ? <CheckCircle2 size={15} className="text-green-600 shrink-0" />
            : <AlertTriangle size={15} className="text-amber-600 shrink-0" />}
          <span className={cn('text-sm font-medium', allOk ? 'text-green-800 dark:text-green-300' : 'text-amber-800 dark:text-amber-300')}>
            {allOk
              ? `All ${total} changes applied successfully.`
              : `${succeeded} of ${total} applied — ${failed.length} failed.`}
          </span>
        </div>
        <button type="button" onClick={onDismiss}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
          Dismiss
        </button>
      </div>

      {/* Failed statements */}
      {failed.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Failed statements:</p>
          {failed.map((r, i) => (
            <div key={i} className="rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-3 py-2 space-y-0.5">
              <div className="flex items-start gap-2">
                <XCircle size={12} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs font-mono text-red-800 dark:text-red-300 break-all">{r.sql}</p>
              </div>
              {r.error && (
                <p className="text-[11px] text-red-600 dark:text-red-400 pl-4">{r.error}</p>
              )}
            </div>
          ))}
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Failed changes remain highlighted above — fix the issue and apply again.
          </p>
        </div>
      )}

      {/* Succeeded (collapsible) */}
      {succeeded > 0 && (
        <>
          <button type="button" onClick={() => setShowAll((v) => !v)}
            className="text-xs text-muted-foreground underline underline-offset-2">
            {showAll ? 'Hide' : 'Show'} {succeeded} successful statement{succeeded !== 1 ? 's' : ''}
          </button>
          {showAll && (
            <div className="space-y-1">
              {results.filter((r) => r.ok).map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <CheckCircle2 size={11} className="text-green-500 shrink-0 mt-0.5" />
                  <span className="font-mono text-green-800 dark:text-green-300">{r.sql}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PermissionsEditor() {
  const { servers, selectedId, selected } = useServerContext()
  const queryClient = useQueryClient()

  const [selectedDb, setSelectedDb] = useState('')
  const [selectedRole, setSelectedRole] = useState('')
  // permState: the user's current edited view (may differ from DB)
  const [permState, setPermState] = useState<Map<string, boolean>>(new Map())
  // origState: what the DB currently has (set from matrix, updated after apply)
  const [origState, setOrigState] = useState<Map<string, boolean>>(new Map())
  const [applyResults, setApplyResults] = useState<ApplyStatementResult[] | null>(null)
  const [validateResult, setValidateResult] = useState<ValidateResponse | null>(null)

  // Prevents permState reset when the matrix refetches after an apply
  const preserveEditsRef = useRef(false)

  // Reset when server changes
  useEffect(() => {
    setSelectedDb(selected?.database ?? '')
    setSelectedRole('')
    setPermState(new Map())
    setOrigState(new Map())
    setApplyResults(null)
    setValidateResult(null)
  }, [selectedId])

  // Reset when database or role changes (new context)
  useEffect(() => {
    setPermState(new Map())
    setOrigState(new Map())
    setApplyResults(null)
    setValidateResult(null)
  }, [selectedDb, selectedRole])

  // Derive connection pointing at the chosen database
  const dbConnection = selected && selectedDb ? { ...selected, database: selectedDb } : selected ?? null

  // ── All roles ───────────────────────────────────────────────────────────────
  const rolesQuery = useQuery<PgRole[]>({
    queryKey: ['roles', selectedId],
    queryFn: () =>
      fetch('/api/pg/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: selected }),
      }).then((r) => r.json()),
    enabled: !!selected,
  })
  const roles = rolesQuery.data ?? []

  // ── Permissions matrix ──────────────────────────────────────────────────────
  const matrixQuery = useQuery<PermissionsMatrix>({
    queryKey: ['perm-editor-matrix', selectedId, selectedDb, selectedRole],
    queryFn: () =>
      fetch('/api/pg/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: dbConnection, rolename: selectedRole }),
      }).then((r) => r.json()),
    enabled: !!dbConnection && !!selectedRole,
  })

  // Initialise / refresh state from the matrix
  useEffect(() => {
    if (!matrixQuery.data) return
    const state = matrixToState(matrixQuery.data)
    setOrigState(new Map(state))
    if (!preserveEditsRef.current) {
      setPermState(new Map(state))
    }
    preserveEditsRef.current = false
  }, [matrixQuery.data])

  // ── Connected user's role info ───────────────────────────────────────────
  const connectedUser = selected?.user ?? ''
  const connectedRole = roles.find((r) => r.rolname === connectedUser)
  const isSuperuser = connectedRole?.rolsuper ?? false

  // ── Compute diff (canGrant filled after mx is available below) ────────────
  const changes: Change[] = []

  // ── Toggle a single checkbox ─────────────────────────────────────────────
  function toggle(fullKey: string) {
    setValidateResult(null) // stale once a new edit is made
    setPermState((prev) => {
      const next = new Map(prev)
      next.set(fullKey, !(prev.get(fullKey) ?? false))
      return next
    })
  }

  // ── Discard all edits ────────────────────────────────────────────────────
  function discard() {
    setPermState(new Map(origState))
    setApplyResults(null)
    setValidateResult(null)
  }

  // ── Validate mutation (dry-run in a transaction that always rolls back) ──
  const validateMutation = useMutation({
    mutationFn: () => {
      const statements = changes
        .map((c) => buildStatement(c.type, c.object, c.privilege, c.grant, selectedRole))
        .filter(Boolean)
      return fetch('/api/pg/permissions-editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: dbConnection, mode: 'validate', statements }),
      }).then((r) => r.json() as Promise<ValidateResponse>)
    },
    onSuccess: (data) => setValidateResult(data),
    onError: () => setValidateResult(null),
  })

  // ── Apply mutation ───────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: () => {
      const statements = changes.map((c) =>
        buildStatement(c.type, c.object, c.privilege, c.grant, selectedRole),
      ).filter(Boolean)
      return fetch('/api/pg/permissions-editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: dbConnection, mode: 'apply', statements }),
      }).then((r) => r.json())
    },
    onSuccess: (data: { results: ApplyStatementResult[] }) => {
      setApplyResults(data.results)
      setValidateResult(null)
      // Refetch matrix to get actual DB state; preserve edited permState
      preserveEditsRef.current = true
      queryClient.invalidateQueries({
        queryKey: ['perm-editor-matrix', selectedId, selectedDb, selectedRole],
      })
    },
    onError: (err: Error) => {
      setApplyResults([{ sql: '(apply request failed)', ok: false, error: err.message }])
    },
  })

  // ── Build section rows from matrix ───────────────────────────────────────
  const mx = matrixQuery.data

  // ── Ownership map + diff (needs mx) ──────────────────────────────────────
  const ownerMap = new Map<string, string>()
  if (mx) {
    for (const db of mx.databases)   ownerMap.set(`database:${db.name}`, db.owner)
    for (const s  of mx.schemas)     ownerMap.set(`schema:${s.name}`, s.owner)
    for (const t  of mx.tables)      ownerMap.set(`table:${t.schema}.${t.name}`, t.owner)
    for (const s  of mx.sequences)   ownerMap.set(`sequence:${s.schema}.${s.name}`, s.owner)
    for (const f  of mx.functions)   ownerMap.set(`function:${f.schema}.${f.name}(${f.args})`, f.owner)
    for (const ty of mx.types)       ownerMap.set(`type:${ty.schema}.${ty.name}`, ty.owner)
  }
  for (const [key, val] of permState) {
    if (origState.get(key) !== val) {
      const { type, object, privilege } = parseKey(key)
      const owner = ownerMap.get(`${type}:${object}`)
      const canGrant = isSuperuser || owner === connectedUser
      changes.push({ type, object, privilege, grant: val, canGrant })
    }
  }

  const dbRows: PermRow[] = (mx?.databases ?? []).map((db) => ({
    rowKey: `database:${db.name}`,
    label: db.name,
  }))
  const schemaRows: PermRow[] = (mx?.schemas ?? []).map((s) => ({
    rowKey: `schema:${s.name}`,
    label: s.name,
  }))
  const tableRows: PermRow[] = (mx?.tables ?? []).map((t) => ({
    rowKey: `table:${t.schema}.${t.name}`,
    label: `${t.schema}.${t.name}`,
    badge: TABLE_KIND_LABEL[t.kind],
  }))
  const seqRows: PermRow[] = (mx?.sequences ?? []).map((s) => ({
    rowKey: `sequence:${s.schema}.${s.name}`,
    label: `${s.schema}.${s.name}`,
  }))
  const funcRows: PermRow[] = (mx?.functions ?? []).map((f) => ({
    rowKey: `function:${f.schema}.${f.name}(${f.args})`,
    label: `${f.schema}.${f.name}(${f.args})`,
    badge: FUNC_KIND_LABEL[f.kind],
  }))
  const typeRows: PermRow[] = (mx?.types ?? []).map((ty) => ({
    rowKey: `type:${ty.schema}.${ty.name}`,
    label: `${ty.schema}.${ty.name}`,
  }))

  const ready = !!mx && !!selectedRole
  const hasChanges = changes.length > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Edit Permissions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Toggle privileges for a role across all objects. Changes are previewed before being applied.
          </p>
        </div>
        <ServerSelect />
      </div>

      {servers.length === 0 && (
        <p className="text-sm text-muted-foreground">No servers configured. Add one on the Servers page.</p>
      )}

      {selected && (
        <div className="space-y-5">
          {/* Selectors */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Database */}
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

            {/* Role */}
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Role</span>
              <Select value={selectedRole} onValueChange={(v) => v && setSelectedRole(v)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select role…">
                    <span className="font-mono text-sm">{selectedRole || 'Select…'}</span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.rolname} value={r.rolname}>
                      <span className="font-mono text-sm">{r.rolname}</span>
                      {r.rolsuper && (
                        <Badge variant="outline" className="ml-2 text-[10px] h-3.5 px-1 text-amber-600 border-amber-300">
                          superuser
                        </Badge>
                      )}
                      {!r.rolcanlogin && !r.rolsuper && (
                        <Badge variant="outline" className="ml-2 text-[10px] h-3.5 px-1 text-purple-600 border-purple-300">
                          group
                        </Badge>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Loading state */}
            {matrixQuery.isLoading && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Loader2 size={13} className="animate-spin" />
                Loading permissions…
              </span>
            )}
          </div>

          {/* Legend */}
          {ready && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <input type="checkbox" checked readOnly className="w-3 h-3 accent-primary" />
                Granted
              </span>
              <span className="flex items-center gap-1.5">
                <input type="checkbox" readOnly className="w-3 h-3" />
                Not granted
              </span>
              <span className="flex items-center gap-1.5">
                <input type="checkbox" checked readOnly className="w-3 h-3 ring-2 ring-amber-400 ring-offset-1 accent-primary" />
                Pending change
              </span>
              <span className="text-muted-foreground/60">· Click ALL / NONE at end of each row for quick row actions</span>
            </div>
          )}

          {/* Pending changes bar */}
          {hasChanges && (
            <PendingBar
              changes={changes}
              role={selectedRole}
              connectedUser={connectedUser}
              isSuperuser={isSuperuser}
              onApply={() => mutation.mutate()}
              onDiscard={discard}
              isPending={mutation.isPending}
              validateResult={validateResult}
              onValidate={() => validateMutation.mutate()}
              isValidating={validateMutation.isPending}
            />
          )}

          {/* Apply results */}
          {applyResults && (
            <ApplyResults
              results={applyResults}
              total={applyResults.length}
              onDismiss={() => setApplyResults(null)}
            />
          )}

          {/* Prompt to select */}
          {!selectedRole && (
            <p className="text-sm text-muted-foreground">Select a database and role to view and edit permissions.</p>
          )}

          {/* Permission sections */}
          {ready && (
            <div className="space-y-6">
              <PermSection
                title="Databases" icon={Database}
                rows={dbRows} privileges={DB_PRIVS}
                permState={permState} origState={origState} onToggle={toggle}
              />
              <PermSection
                title="Schemas" icon={FolderOpen}
                rows={schemaRows} privileges={SCHEMA_PRIVS}
                permState={permState} origState={origState} onToggle={toggle}
              />
              <PermSection
                title="Tables & Views" icon={Table2}
                rows={tableRows} privileges={TABLE_PRIVS}
                permState={permState} origState={origState} onToggle={toggle}
              />
              <PermSection
                title="Sequences" icon={Hash}
                rows={seqRows} privileges={SEQ_PRIVS}
                permState={permState} origState={origState} onToggle={toggle}
              />
              <PermSection
                title="Functions & Procedures" icon={Code2}
                rows={funcRows} privileges={FUNC_PRIVS}
                permState={permState} origState={origState} onToggle={toggle}
              />
              <PermSection
                title="Types" icon={Tag}
                rows={typeRows} privileges={TYPE_PRIVS}
                permState={permState} origState={origState} onToggle={toggle}
              />

              {/* Bottom apply bar (duplicate for long pages) */}
              {hasChanges && (
                <PendingBar
                  changes={changes}
                  role={selectedRole}
                  connectedUser={connectedUser}
                  isSuperuser={isSuperuser}
                  onApply={() => mutation.mutate()}
                  onDiscard={discard}
                  isPending={mutation.isPending}
                  validateResult={validateResult}
                  onValidate={() => validateMutation.mutate()}
                  isValidating={validateMutation.isPending}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
