'use client'
import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  KeyRound, ChevronDown, Play, Loader2, CheckCircle2, XCircle,
  AlertTriangle, Info, RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ServerSelect } from '@/components/ServerSelect'
import { DatabaseSelect } from '@/components/DatabaseSelect'
import { useServerContext } from '@/context/ServerContext'
import type { PgRole, ServerConnection } from '@/types'
import type { GrantObjectType } from '@/app/api/pg/grant/route'

// ─── Config ───────────────────────────────────────────────────────────────────

const OBJECT_TYPE_LABELS: Record<GrantObjectType, string> = {
  schema:        'Schema',
  table:         'Table / View',
  database:      'Database',
  sequence:      'Sequence',
  function:      'Function',
  all_tables:    'All Tables in Schema',
  all_sequences: 'All Sequences in Schema',
  all_functions: 'All Functions in Schema',
}

const PRIVILEGES: Record<GrantObjectType, string[]> = {
  schema:        ['USAGE', 'CREATE'],
  table:         ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'],
  database:      ['CONNECT', 'CREATE', 'TEMP'],
  sequence:      ['USAGE', 'SELECT', 'UPDATE'],
  function:      ['EXECUTE'],
  all_tables:    ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'],
  all_sequences: ['USAGE', 'SELECT', 'UPDATE'],
  all_functions: ['EXECUTE'],
}

// Types where the object picker shows schemas (not the objects themselves)
const SCHEMA_SCOPED: GrantObjectType[] = ['all_tables', 'all_sequences', 'all_functions']

// Types that can also set DEFAULT PRIVILEGES
const HAS_DEFAULT_PRIVS: GrantObjectType[] = ['all_tables', 'all_sequences', 'all_functions']

const DEFAULT_PRIVS_OBJECT: Record<string, string> = {
  all_tables: 'TABLES',
  all_sequences: 'SEQUENCES',
  all_functions: 'FUNCTIONS',
}

const CUSTOM_SENTINEL = '__custom__'

// ─── SQL generation ───────────────────────────────────────────────────────────

function qi(name: string) {
  return `"${name.replace(/"/g, '""')}"`
}

/** Returns 'ALL PRIVILEGES' when every available privilege for a type is selected. */
function privList(privs: string[], objectType: GrantObjectType): string {
  const all = PRIVILEGES[objectType]
  if (all.length > 0 && privs.length === all.length && all.every((p) => privs.includes(p))) {
    return 'ALL PRIVILEGES'
  }
  return privs.join(', ')
}

/** Same but for inline bulk lists (tables/sequences/functions). */
function privListFor(privs: string[], key: 'all_tables' | 'all_sequences' | 'all_functions'): string {
  const all = PRIVILEGES[key]
  if (all.length > 0 && privs.length === all.length && all.every((p) => privs.includes(p))) {
    return 'ALL PRIVILEGES'
  }
  return privs.join(', ')
}

interface Pg15Grants {
  tablePrivs: string[]
  seqPrivs: string[]
  funcPrivs: string[]
  defaultPrivs: boolean
}

function buildStatements(params: {
  action: 'GRANT' | 'REVOKE'
  role: string
  objectType: GrantObjectType
  object: string
  privileges: string[]
  withGrantOption: boolean
  cascade: boolean
  includeDefaultPrivs: boolean
  pg15?: Pg15Grants   // extra object-level grants when granting schema access
}): string[] {
  const { action, role, objectType, object, privileges, withGrantOption, cascade, includeDefaultPrivs, pg15 } = params
  if (!privileges.length || !role || !object) return []

  const rolePart = qi(role)
  const stmts: string[] = []

  function objectClauseFor(type: GrantObjectType, obj: string) {
    switch (type) {
      case 'schema':        return `ON SCHEMA ${qi(obj)}`
      case 'database':      return `ON DATABASE ${qi(obj)}`
      case 'table':         return `ON TABLE ${obj}`
      case 'sequence':      return `ON SEQUENCE ${obj}`
      case 'function':      return `ON FUNCTION ${obj}`
      case 'all_tables':    return `ON ALL TABLES IN SCHEMA ${qi(obj)}`
      case 'all_sequences': return `ON ALL SEQUENCES IN SCHEMA ${qi(obj)}`
      case 'all_functions': return `ON ALL FUNCTIONS IN SCHEMA ${qi(obj)}`
    }
  }

  function pushGrant(privList: string, clause: string) {
    let s = `GRANT ${privList} ${clause} TO ${rolePart}`
    if (withGrantOption) s += ' WITH GRANT OPTION'
    stmts.push(s + ';')
  }

  function pushRevoke(privList: string, clause: string) {
    let s = `REVOKE ${privList} ${clause} FROM ${rolePart}`
    if (cascade) s += ' CASCADE'
    stmts.push(s + ';')
  }

  if (action === 'GRANT') {
    pushGrant(privList(privileges, objectType), objectClauseFor(objectType, object))

    if (includeDefaultPrivs && HAS_DEFAULT_PRIVS.includes(objectType)) {
      const objWord = DEFAULT_PRIVS_OBJECT[objectType]
      let s = `ALTER DEFAULT PRIVILEGES IN SCHEMA ${qi(object)} GRANT ${privList(privileges, objectType)} ON ${objWord} TO ${rolePart}`
      if (withGrantOption) s += ' WITH GRANT OPTION'
      stmts.push(s + ';')
    }

    // ── PG 15+ object-level grants when granting schema access ────────────
    if (objectType === 'schema' && pg15) {
      const schema = qi(object)
      if (pg15.tablePrivs.length) {
        pushGrant(privListFor(pg15.tablePrivs, 'all_tables'), `ON ALL TABLES IN SCHEMA ${schema}`)
        if (pg15.defaultPrivs) {
          let s = `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT ${privListFor(pg15.tablePrivs, 'all_tables')} ON TABLES TO ${rolePart}`
          if (withGrantOption) s += ' WITH GRANT OPTION'
          stmts.push(s + ';')
        }
      }
      if (pg15.seqPrivs.length) {
        pushGrant(privListFor(pg15.seqPrivs, 'all_sequences'), `ON ALL SEQUENCES IN SCHEMA ${schema}`)
        if (pg15.defaultPrivs) {
          let s = `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT ${privListFor(pg15.seqPrivs, 'all_sequences')} ON SEQUENCES TO ${rolePart}`
          if (withGrantOption) s += ' WITH GRANT OPTION'
          stmts.push(s + ';')
        }
      }
      if (pg15.funcPrivs.length) {
        pushGrant(privListFor(pg15.funcPrivs, 'all_functions'), `ON ALL FUNCTIONS IN SCHEMA ${schema}`)
        if (pg15.defaultPrivs) {
          let s = `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT ${privListFor(pg15.funcPrivs, 'all_functions')} ON FUNCTIONS TO ${rolePart}`
          if (withGrantOption) s += ' WITH GRANT OPTION'
          stmts.push(s + ';')
        }
      }
    }
  } else {
    pushRevoke(privList(privileges, objectType), objectClauseFor(objectType, object))

    if (includeDefaultPrivs && HAS_DEFAULT_PRIVS.includes(objectType)) {
      const objWord = DEFAULT_PRIVS_OBJECT[objectType]
      stmts.push(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${qi(object)} REVOKE ${privList(privileges, objectType)} ON ${objWord} FROM ${rolePart};`)
    }
  }

  return stmts
}

// ─── Object picker ────────────────────────────────────────────────────────────

function ObjectPicker({
  connection,
  type,
  value,
  onChange,
}: {
  connection: ServerConnection
  type: GrantObjectType
  value: string
  onChange: (v: string) => void
}) {
  const [showCustom, setShowCustom] = useState(false)
  const [customValue, setCustomValue] = useState('')

  useEffect(() => { setShowCustom(false); setCustomValue('') }, [type])

  const { data: objects = [], isFetching } = useQuery({
    queryKey: ['grant-objects', connection.id, connection.database, type],
    queryFn: async () => {
      const res = await fetch('/api/pg/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection, mode: 'resources', type }),
      })
      const data = await res.json() as { objects: string[] }
      return data.objects ?? []
    },
    staleTime: 30_000,
  })

  if (showCustom) {
    return (
      <div className="flex gap-1">
        <Input
          className="h-9 text-sm font-mono flex-1"
          placeholder="e.g. public"
          value={customValue}
          autoFocus
          onChange={(e) => { setCustomValue(e.target.value); onChange(e.target.value) }}
        />
        <Button size="sm" variant="ghost" className="h-9 px-2 text-muted-foreground"
          onClick={() => { setShowCustom(false); onChange('') }}>
          <ChevronDown size={14} />
        </Button>
      </div>
    )
  }

  return (
    <Select value={value || ''} onValueChange={(v) => {
      if (!v) return
      if (v === CUSTOM_SENTINEL) { setShowCustom(true); onChange(customValue) }
      else onChange(v)
    }}>
      <SelectTrigger className="h-9 font-mono text-sm">
        {isFetching
          ? <span className="text-muted-foreground italic text-sm">Loading…</span>
          : <SelectValue placeholder="Select object…" />}
      </SelectTrigger>
      <SelectContent>
        {objects.map((o) => (
          <SelectItem key={o} value={o} className="text-sm font-mono">{o}</SelectItem>
        ))}
        <SelectItem value={CUSTOM_SENTINEL} className="text-sm italic text-muted-foreground border-t border-border mt-1">
          Type manually…
        </SelectItem>
      </SelectContent>
    </Select>
  )
}

// ─── Privilege checkbox group ─────────────────────────────────────────────────

function PrivilegeSelector({
  options,
  selected,
  onChange,
  currentGrants,
  isFetchingCurrent,
}: {
  options: string[]
  selected: string[]
  onChange: (v: string[]) => void
  currentGrants?: Set<string>
  isFetchingCurrent?: boolean
}) {
  function toggle(p: string) {
    onChange(selected.includes(p) ? selected.filter((x) => x !== p) : [...selected, p])
  }
  const allSelected = options.every((p) => selected.includes(p))

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(allSelected ? [] : [...options])}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
        {isFetchingCurrent && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 size={10} className="animate-spin" /> Fetching current state…
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((p) => {
          const on = selected.includes(p)
          const isGranted = currentGrants?.has(p)
          const hasCurrentInfo = currentGrants !== undefined

          return (
            <button
              key={p}
              type="button"
              onClick={() => toggle(p)}
              className={`group relative px-2.5 py-1 rounded text-xs font-mono border transition-colors ${
                on
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/50'
              }`}
            >
              {p}
              {hasCurrentInfo && (
                <span
                  title={isGranted ? 'Currently granted' : 'Not currently granted'}
                  className={`absolute -top-1 -right-1 w-2 h-2 rounded-full border border-background ${
                    isGranted ? 'bg-green-500' : 'bg-muted-foreground/30'
                  }`}
                />
              )}
            </button>
          )
        })}
      </div>
      {currentGrants !== undefined && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" /> currently granted
          <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/30 ml-2" /> not granted
        </p>
      )}
    </div>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExecResult {
  ok: boolean
  rolledBack: boolean
  results: { sql: string; ok: boolean; error?: string }[]
}

interface PrivResult {
  privilege: string
  effective: boolean
  directGrant: boolean
  viaPublic: boolean
  viaInheritance: boolean
  defaultPrivSet: boolean | null
  expected: boolean
  ok: boolean
  explanation: string | null
}

interface VerifyResult {
  isSuperuser: boolean
  results: PrivResult[]
}

// ─── Execute result display ───────────────────────────────────────────────────

function ExecuteResult({ result }: { result: ExecResult }) {
  return (
    <div className={`rounded-lg border p-4 space-y-3 text-sm ${
      result.ok
        ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
        : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
    }`}>
      <div className="flex items-center gap-2">
        {result.ok
          ? <CheckCircle2 size={15} className="text-green-600 dark:text-green-400 shrink-0" />
          : <XCircle size={15} className="text-red-500 shrink-0" />}
        <span className={`font-medium ${result.ok ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
          {result.ok ? 'All statements executed successfully.' : 'Execution failed — changes rolled back.'}
        </span>
      </div>
      <div className="space-y-1.5">
        {result.results.map((r, i) => (
          <div key={i} className="flex items-start gap-2">
            {r.ok
              ? <CheckCircle2 size={13} className="text-green-500 mt-0.5 shrink-0" />
              : <XCircle size={13} className="text-red-500 mt-0.5 shrink-0" />}
            <div className="min-w-0">
              <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground/80">{r.sql}</pre>
              {r.error && <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{r.error}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Verification display ─────────────────────────────────────────────────────

function VerificationPanel({
  verify,
  action,
  isLoading,
}: {
  verify: VerifyResult | null
  action: 'GRANT' | 'REVOKE'
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-lg border border-border px-4 py-3">
        <Loader2 size={14} className="animate-spin shrink-0" />
        Verifying current privilege state…
      </div>
    )
  }
  if (!verify) return null

  const allOk = verify.results.every((r) => r.ok)
  const anyUnexpected = verify.results.some((r) => !r.ok)

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b border-border ${
        allOk
          ? 'bg-green-50 dark:bg-green-950/30 text-green-800 dark:text-green-300'
          : 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
      }`}>
        {allOk
          ? <CheckCircle2 size={14} className="shrink-0" />
          : <AlertTriangle size={14} className="shrink-0" />}
        {allOk
          ? `Verified — all privileges ${action === 'GRANT' ? 'are now active' : 'have been removed'}.`
          : `Verification found unexpected state — see details below.`}
        {verify.isSuperuser && (
          <Badge variant="outline" className="ml-auto text-[10px] font-mono">SUPERUSER</Badge>
        )}
      </div>

      {/* Per-privilege rows */}
      <div className="divide-y divide-border">
        {verify.results.map((r) => (
          <div key={r.privilege} className="px-4 py-3 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              {r.ok
                ? <CheckCircle2 size={13} className="text-green-500 shrink-0" />
                : <XCircle size={13} className="text-amber-500 shrink-0" />}
              <code className="text-xs font-mono font-semibold">{r.privilege}</code>

              {/* Effective state badge */}
              <Badge
                variant="outline"
                className={`text-[10px] font-mono ${
                  r.effective
                    ? 'text-green-600 border-green-300 dark:text-green-400'
                    : 'text-muted-foreground'
                }`}
              >
                {r.effective ? 'EFFECTIVE' : 'NOT EFFECTIVE'}
              </Badge>

              {/* Source badges */}
              {r.directGrant && (
                <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300 dark:text-blue-400">direct grant</Badge>
              )}
              {r.viaPublic && (
                <Badge variant="outline" className="text-[10px] text-purple-600 border-purple-300 dark:text-purple-400">via PUBLIC</Badge>
              )}
              {r.viaInheritance && (
                <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-300 dark:text-orange-400">inherited</Badge>
              )}
              {r.defaultPrivSet === true && (
                <Badge variant="outline" className="text-[10px] text-teal-600 border-teal-300 dark:text-teal-400">default privs set</Badge>
              )}
              {r.defaultPrivSet === false && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">no default privs</Badge>
              )}
            </div>

            {/* Explanation for unexpected state */}
            {r.explanation && (
              <div className={`flex items-start gap-1.5 text-xs rounded px-2 py-1.5 ${
                r.ok
                  ? 'text-muted-foreground bg-muted/40'
                  : 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30'
              }`}>
                <Info size={11} className="mt-0.5 shrink-0" />
                <span>{r.explanation}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {anyUnexpected && (
        <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
          The SQL statements executed without error, but the live privilege check returned an unexpected state. Review the explanations above.
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GrantRevokePage() {
  const { selected, selectedId } = useServerContext()
  const queryClient = useQueryClient()

  // Database selector — scopes object picker to the chosen database
  const [selectedDb, setSelectedDb] = useState('')

  // Form state
  const [action, setAction] = useState<'GRANT' | 'REVOKE'>('GRANT')
  const [role, setRole] = useState('')
  const [objectType, setObjectType] = useState<GrantObjectType>('schema')
  const [object, setObject] = useState('')
  const [privileges, setPrivileges] = useState<string[]>(['USAGE'])
  const [withGrantOption, setWithGrantOption] = useState(false)
  const [cascade, setCascade] = useState(false)
  const [includeDefaultPrivs, setIncludeDefaultPrivs] = useState(false)
  // PG 15+ extra object grants (only applies when objectType === 'schema' + action === 'GRANT')
  const [pg15Enabled, setPg15Enabled] = useState(false)
  const [pg15TablePrivs, setPg15TablePrivs] = useState<string[]>(['SELECT'])
  const [pg15SeqPrivs, setPg15SeqPrivs] = useState<string[]>(['USAGE', 'SELECT'])
  const [pg15FuncPrivs, setPg15FuncPrivs] = useState<string[]>([])
  const [pg15DefaultPrivs, setPg15DefaultPrivs] = useState(true)
  const [execResult, setExecResult] = useState<ExecResult | null>(null)
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)

  // Reset database selection when server switches
  useEffect(() => { setSelectedDb('') }, [selectedId])

  // For database-type objects the connection stays cluster-level;
  // for all others (schema, table, sequence, function…) connect to the chosen db.
  const dbConnection: ServerConnection | null = selected
    ? (selectedDb && objectType !== 'database' ? { ...selected, database: selectedDb } : selected)
    : null

  // ── Current state: auto-fetch when role + object are both set ──────────────
  const isBulkType = SCHEMA_SCOPED.includes(objectType)
  const canFetchCurrent = !!dbConnection && !!role && !!object && !isBulkType

  const currentStateQuery = useQuery({
    queryKey: ['grant-current-state', selected?.id, selectedDb, role, objectType, object],
    queryFn: async () => {
      const res = await fetch('/api/pg/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection: dbConnection,
          mode: 'verify',
          role,
          objectType,
          object,
          privileges: PRIVILEGES[objectType],
          action: 'GRANT',
          includeDefaultPrivs: false,
        }),
      })
      return res.json() as Promise<VerifyResult>
    },
    enabled: canFetchCurrent,
    staleTime: 10_000,
  })

  // Auto-select currently granted privileges when current state loads
  useEffect(() => {
    if (!currentStateQuery.data) return
    const granted = currentStateQuery.data.results
      .filter((r) => r.effective)
      .map((r) => r.privilege)
    setPrivileges(granted.length > 0 ? granted : [])
    setExecResult(null)
    setVerifyResult(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStateQuery.data])

  const currentGrants: Set<string> | undefined = currentStateQuery.data
    ? new Set(currentStateQuery.data.results.filter((r) => r.effective).map((r) => r.privilege))
    : undefined

  // Reset relevant fields when type changes
  function handleTypeChange(t: GrantObjectType) {
    setObjectType(t)
    setObject('')
    setPrivileges([PRIVILEGES[t][0]])
    setExecResult(null)
    setVerifyResult(null)
  }

  function handleActionChange(a: 'GRANT' | 'REVOKE') {
    setAction(a)
    setWithGrantOption(false)
    setCascade(false)
    setExecResult(null)
    setVerifyResult(null)
  }

  async function runVerify(params: {
    role: string; objectType: GrantObjectType; object: string
    privileges: string[]; action: 'GRANT' | 'REVOKE'; includeDefaultPrivs: boolean
  }) {
    setIsVerifying(true)
    setVerifyResult(null)
    try {
      const res = await fetch('/api/pg/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: dbConnection, mode: 'verify', ...params }),
      })
      setVerifyResult(await res.json() as VerifyResult)
    } finally {
      setIsVerifying(false)
    }
  }

  const { data: rolesData } = useQuery({
    queryKey: ['roles', selected?.id],
    queryFn: async () => {
      const res = await fetch('/api/pg/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: selected }),
      })
      return res.json() as Promise<PgRole[]>
    },
    enabled: !!selected,
  })

  const roles = rolesData ?? []

  const pg15Grants: Pg15Grants | undefined =
    objectType === 'schema' && action === 'GRANT' && pg15Enabled
      ? { tablePrivs: pg15TablePrivs, seqPrivs: pg15SeqPrivs, funcPrivs: pg15FuncPrivs, defaultPrivs: pg15DefaultPrivs }
      : undefined

  const statements = selected ? buildStatements({
    action, role, objectType, object, privileges,
    withGrantOption, cascade, includeDefaultPrivs,
    pg15: pg15Grants,
  }) : []

  const canExecute = statements.length > 0

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/pg/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: dbConnection, mode: 'execute', statements }),
      })
      return res.json() as Promise<ExecResult>
    },
    onSuccess: (data) => {
      setExecResult(data)
      // Invalidate the current-state cache so the dots re-fetch after the change
      queryClient.invalidateQueries({ queryKey: ['grant-current-state', selected?.id, selectedDb, role, objectType, object] })
      // Always verify — even on failure, show current state
      runVerify({ role, objectType, object, privileges, action, includeDefaultPrivs })
    },
  })

  const showDefaultPrivsOption = HAS_DEFAULT_PRIVS.includes(objectType) && !!object

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <KeyRound size={20} className="text-muted-foreground" />
            Grant / Revoke
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Modify privileges for a role on any object in the server.
          </p>
        </div>
        <ServerSelect />
      </div>

      {!selected ? (
        <p className="text-muted-foreground text-sm">Select a server to get started.</p>
      ) : (
        <div className="space-y-6">

          {/* ── Action toggle ── */}
          <div className="flex items-center gap-2 flex-wrap">
            {(['GRANT', 'REVOKE'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => handleActionChange(a)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                  action === a
                    ? a === 'GRANT'
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-red-600 text-white border-red-600'
                    : 'bg-background text-muted-foreground border-border hover:border-foreground/30'
                }`}
              >
                {a}
              </button>
            ))}

            <div className="h-5 w-px bg-border mx-1" />

            {/* Grant ALL quick-action */}
            <button
              type="button"
              onClick={() => {
                handleActionChange('GRANT')
                setObjectType('schema')
                setPrivileges([...PRIVILEGES['schema']])
                setPg15Enabled(true)
                setPg15TablePrivs([...PRIVILEGES['all_tables']])
                setPg15SeqPrivs([...PRIVILEGES['all_sequences']])
                setPg15FuncPrivs([...PRIVILEGES['all_functions']])
                setPg15DefaultPrivs(true)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-dashed border-green-400 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
              title="Fills the form to run GRANT ALL PRIVILEGES on the schema and all its objects, covering PostgreSQL 15+ requirements"
            >
              <KeyRound size={12} />
              Grant ALL on schema
            </button>
          </div>

          {/* ── Role ── */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Role to {action === 'GRANT' ? 'grant to' : 'revoke from'}
            </label>
            {roles.length > 0 ? (
              <Select value={role} onValueChange={(v) => v && setRole(v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select role…" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.oid} value={r.rolname}>
                      <span className="font-mono text-sm">{r.rolname}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                className="h-9 font-mono"
                placeholder="rolename"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            )}
          </div>

          {/* ── Database + object type + object ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Database</label>
              <DatabaseSelect
                connection={selected}
                value={selectedDb}
                onChange={(db) => {
                  setSelectedDb(db)
                  setObject('')
                  setExecResult(null)
                  setVerifyResult(null)
                }}
                placeholder="Default database"
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Object type</label>
              <Select value={objectType} onValueChange={(v) => v && handleTypeChange(v as GrantObjectType)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(OBJECT_TYPE_LABELS) as [GrantObjectType, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k} className="text-sm">{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {SCHEMA_SCOPED.includes(objectType) ? 'Schema' : OBJECT_TYPE_LABELS[objectType]}
              </label>
              <ObjectPicker
                connection={dbConnection!}
                type={objectType}
                value={object}
                onChange={(v) => { setObject(v); setExecResult(null); setVerifyResult(null) }}
              />
            </div>
          </div>

          {/* ── Privileges ── */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Privileges</label>
            <PrivilegeSelector
              options={PRIVILEGES[objectType]}
              selected={privileges}
              onChange={(v) => { setPrivileges(v); setExecResult(null); setVerifyResult(null) }}
              currentGrants={currentGrants}
              isFetchingCurrent={currentStateQuery.isFetching}
            />
          </div>

          {/* ── Options ── */}
          <div className="flex flex-wrap gap-4">
            {action === 'GRANT' && (
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={withGrantOption}
                  onChange={(e) => setWithGrantOption(e.target.checked)}
                />
                <span>WITH GRANT OPTION</span>
                <span className="text-xs text-muted-foreground">(allow this role to re-grant)</span>
              </label>
            )}
            {action === 'REVOKE' && (
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={cascade}
                  onChange={(e) => setCascade(e.target.checked)}
                />
                <span>CASCADE</span>
                <span className="text-xs text-muted-foreground">(also revoke from roles this one granted to)</span>
              </label>
            )}
            {showDefaultPrivsOption && (
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={includeDefaultPrivs}
                  onChange={(e) => setIncludeDefaultPrivs(e.target.checked)}
                />
                <span>Also set DEFAULT PRIVILEGES</span>
                <span className="text-xs text-muted-foreground">(apply to future objects too)</span>
              </label>
            )}
          </div>

          {/* ── PG 15+ object grants (shown when granting schema access) ── */}
          {objectType === 'schema' && action === 'GRANT' && object && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 overflow-hidden">
              <div className="flex items-start gap-2 px-4 py-3 border-b border-amber-200 dark:border-amber-800">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="space-y-1 text-xs text-amber-800 dark:text-amber-300">
                  <p className="font-medium">PostgreSQL 15+ — schema USAGE alone is not enough</p>
                  <p>
                    <code className="font-mono">GRANT USAGE ON SCHEMA</code> only lets the role enter the schema.
                    PostgreSQL 15 removed the implicit <code className="font-mono">PUBLIC</code> grants, so the role
                    also needs explicit grants on the tables, sequences, and functions inside it.
                  </p>
                </div>
                <label className="ml-auto flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    checked={pg15Enabled}
                    onChange={(e) => setPg15Enabled(e.target.checked)}
                  />
                  Include object grants
                </label>
              </div>

              {pg15Enabled && (
                <div className="px-4 py-3 space-y-4">
                  {/* Tables */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">Tables &amp; Views</span>
                      <span className="text-xs text-muted-foreground font-mono">ON ALL TABLES IN SCHEMA</span>
                    </div>
                    <PrivilegeSelector
                      options={PRIVILEGES['all_tables']}
                      selected={pg15TablePrivs}
                      onChange={setPg15TablePrivs}
                    />
                  </div>

                  {/* Sequences */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">Sequences</span>
                      <span className="text-xs text-muted-foreground font-mono">ON ALL SEQUENCES IN SCHEMA</span>
                    </div>
                    <PrivilegeSelector
                      options={PRIVILEGES['all_sequences']}
                      selected={pg15SeqPrivs}
                      onChange={setPg15SeqPrivs}
                    />
                  </div>

                  {/* Functions */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">Functions</span>
                      <span className="text-xs text-muted-foreground font-mono">ON ALL FUNCTIONS IN SCHEMA</span>
                    </div>
                    <PrivilegeSelector
                      options={PRIVILEGES['all_functions']}
                      selected={pg15FuncPrivs}
                      onChange={setPg15FuncPrivs}
                    />
                  </div>

                  {/* Default privileges */}
                  <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={pg15DefaultPrivs}
                      onChange={(e) => setPg15DefaultPrivs(e.target.checked)}
                    />
                    <span className="font-medium">Set DEFAULT PRIVILEGES</span>
                    <span className="text-muted-foreground">— also covers objects created in the future</span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* ── SQL Preview ── */}
          {statements.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide text-xs">SQL to execute</label>
              <pre className="rounded-lg border border-border bg-black/5 dark:bg-white/5 px-4 py-3 text-sm font-mono leading-relaxed whitespace-pre-wrap break-all">
                {statements.join('\n')}
              </pre>
            </div>
          )}

          {/* ── Execute ── */}
          <div className="flex items-center gap-3">
            <Button
              onClick={() => mutation.mutate()}
              disabled={!canExecute || mutation.isPending}
              variant={action === 'REVOKE' ? 'destructive' : 'default'}
              className="min-w-[140px]"
            >
              {mutation.isPending
                ? <Loader2 size={14} className="mr-2 animate-spin" />
                : <Play size={14} className="mr-2" />}
              {action === 'GRANT' ? 'Grant privileges' : 'Revoke privileges'}
            </Button>

            {(execResult || verifyResult) && (
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => { setExecResult(null); setVerifyResult(null) }}
              >
                <RotateCcw size={11} />
                Clear result
              </button>
            )}
          </div>

          {/* ── Execution result ── */}
          {execResult && <ExecuteResult result={execResult} />}

          {/* ── Verification ── */}
          {(isVerifying || verifyResult) && (
            <VerificationPanel
              verify={verifyResult}
              action={action}
              isLoading={isVerifying}
            />
          )}

          {/* ── Incomplete form notice ── */}
          {!canExecute && !!(role || object || privileges.length) && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle size={12} />
              Fill in role, object, and at least one privilege to generate SQL.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
