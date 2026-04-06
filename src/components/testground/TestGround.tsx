'use client'
import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Plus, Trash2, Play, AlertTriangle, CheckCircle2, XCircle, Loader2, RotateCcw, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ServerSelect } from '@/components/ServerSelect'
import { useServerContext } from '@/context/ServerContext'
import type { PgRole, ServerConnection } from '@/types'
import type { CheckType, PermissionCheck, CheckResult } from '@/app/api/pg/testground/route'

// ─── Privilege options per object type ────────────────────────────────────────

const PRIVILEGES: Record<CheckType, string[]> = {
  database: ['CONNECT', 'CREATE', 'TEMP'],
  schema:   ['USAGE', 'CREATE'],
  table:    ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'],
  column:   ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'],
  sequence: ['USAGE', 'SELECT', 'UPDATE'],
  function: ['EXECUTE'],
}

const PLACEHOLDERS: Record<CheckType, string> = {
  database: 'mydb',
  schema:   'public',
  table:    'public.users',
  column:   'public.users',
  sequence: 'public.users_id_seq',
  function: 'public.my_func()',
}

// ─── SQL preview builder ──────────────────────────────────────────────────────

function q(s: string) { return `'${s.replace(/'/g, "''")}'` }

function buildCheckSql(check: Pick<PermissionCheck, 'type' | 'role' | 'object' | 'column' | 'privilege'>): string {
  const { type, role, object, column, privilege } = check
  switch (type) {
    case 'database': return `SELECT has_database_privilege(${q(role)}, ${q(object)}, ${q(privilege)}) AS granted;`
    case 'schema':   return `SELECT has_schema_privilege(${q(role)}, ${q(object)}, ${q(privilege)}) AS granted;`
    case 'table':    return `SELECT has_table_privilege(${q(role)}, ${q(object)}, ${q(privilege)}) AS granted;`
    case 'column':   return `SELECT has_column_privilege(${q(role)}, ${q(object)}, ${q(column ?? '')}, ${q(privilege)}) AS granted;`
    case 'sequence': return `SELECT has_sequence_privilege(${q(role)}, ${q(object)}, ${q(privilege)}) AS granted;`
    case 'function': return `SELECT has_function_privilege(${q(role)}, ${q(object)}, ${q(privilege)}) AS granted;`
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ResultIcon({ granted, error }: { granted: boolean | null; error?: string }) {
  if (error) return <XCircle size={16} className="text-red-500" />
  if (granted === true)  return <CheckCircle2 size={16} className="text-green-500" />
  if (granted === false) return <XCircle size={16} className="text-muted-foreground/50" />
  return <span className="text-muted-foreground/30 text-sm">—</span>
}

function ResultBadge({ granted, error }: { granted: boolean | null; error?: string }) {
  if (error) return <Badge variant="destructive" className="text-[10px]">ERROR</Badge>
  if (granted === true)  return <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 text-[10px]">GRANTED</Badge>
  if (granted === false) return <Badge variant="outline" className="text-[10px] text-muted-foreground">DENIED</Badge>
  return null
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchObjects(connection: ServerConnection, type: CheckType): Promise<string[]> {
  const res = await fetch('/api/pg/testground', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connection, mode: 'resources', type }),
  })
  const data = await res.json() as { objects: string[] }
  return data.objects ?? []
}

async function runChecks(connection: ServerConnection, checks: PermissionCheck[]) {
  const res = await fetch('/api/pg/testground', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connection, mode: 'check', checks }),
  })
  return res.json() as Promise<{ results: CheckResult[] }>
}

async function executeSQL(connection: ServerConnection, sql: string, role: string | null) {
  const res = await fetch('/api/pg/testground', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connection, mode: 'execute', sql, role: role || null }),
  })
  return res.json() as Promise<{
    columns: string[]
    rows: Record<string, unknown>[]
    rowCount: number
    rolledBack: boolean
    error?: string
  }>
}

// ─── Object picker: dropdown of real DB objects + free-text fallback ──────────

const CUSTOM_SENTINEL = '__custom__'

function ObjectPicker({
  connection,
  type,
  value,
  onChange,
}: {
  connection: ServerConnection
  type: CheckType
  value: string
  onChange: (v: string) => void
}) {
  const [showCustom, setShowCustom] = useState(false)
  const [customValue, setCustomValue] = useState('')

  // Reset custom state when type changes
  useEffect(() => {
    setShowCustom(false)
    setCustomValue('')
  }, [type])

  const { data: objects = [], isFetching } = useQuery({
    queryKey: ['testground-objects', connection.id, type],
    queryFn: () => fetchObjects(connection, type),
    staleTime: 30_000,
  })

  function handleSelect(v: string | null) {
    if (!v) return
    if (v === CUSTOM_SENTINEL) {
      setShowCustom(true)
      onChange(customValue)
    } else {
      setShowCustom(false)
      onChange(v)
    }
  }

  if (showCustom) {
    return (
      <div className="flex gap-1">
        <Input
          className="h-8 text-xs font-mono flex-1"
          placeholder={PLACEHOLDERS[type]}
          value={customValue}
          autoFocus
          onChange={(e) => { setCustomValue(e.target.value); onChange(e.target.value) }}
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-xs text-muted-foreground"
          onClick={() => { setShowCustom(false); onChange('') }}
        >
          <ChevronDown size={12} />
        </Button>
      </div>
    )
  }

  return (
    <Select value={value || ''} onValueChange={handleSelect}>
      <SelectTrigger className="h-8 text-xs font-mono">
        {isFetching
          ? <span className="text-muted-foreground italic">Loading…</span>
          : <SelectValue placeholder={objects.length ? 'Pick object…' : PLACEHOLDERS[type]} />}
      </SelectTrigger>
      <SelectContent>
        {objects.map((o) => (
          <SelectItem key={o} value={o} className="text-xs font-mono">{o}</SelectItem>
        ))}
        <SelectItem value={CUSTOM_SENTINEL} className="text-xs italic text-muted-foreground border-t border-border mt-1">
          Other (type manually)…
        </SelectItem>
      </SelectContent>
    </Select>
  )
}

// ─── Permission Checker tab ───────────────────────────────────────────────────

function PermissionChecker({ connection }: { connection: ServerConnection }) {
  const [checks, setChecks] = useState<PermissionCheck[]>([])
  const [results, setResults] = useState<Record<string, CheckResult>>({})
  const [running, setRunning] = useState<Set<string>>(new Set())

  // Form state
  const [role, setRole] = useState('')
  const [type, setType] = useState<CheckType>('table')
  const [object, setObject] = useState('')
  const [column, setColumn] = useState('')
  const [privilege, setPrivilege] = useState('SELECT')

  const { data: rolesData } = useQuery({
    queryKey: ['roles', connection.id],
    queryFn: async () => {
      const res = await fetch('/api/pg/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection }),
      })
      return res.json() as Promise<PgRole[]>
    },
  })

  const roles = rolesData ?? []

  // Run specific checks and merge results
  async function execChecks(toRun: PermissionCheck[]) {
    const ids = new Set(toRun.map((c) => c.id))
    setRunning((prev) => new Set([...prev, ...ids]))
    try {
      const data = await runChecks(connection, toRun)
      setResults((prev) => {
        const next = { ...prev }
        for (const r of data.results) next[r.id] = r
        return next
      })
    } finally {
      setRunning((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next })
    }
  }

  function addAndRun() {
    if (!role || !object || !privilege) return
    const id = crypto.randomUUID()
    const check: PermissionCheck = { id, role, type, object, column: type === 'column' ? column : undefined, privilege }
    setChecks((prev) => [...prev, check])
    execChecks([check])
  }

  function removeCheck(id: string) {
    setChecks((prev) => prev.filter((c) => c.id !== id))
    setResults((prev) => { const next = { ...prev }; delete next[id]; return next })
  }

  function rerunCheck(check: PermissionCheck) {
    setResults((prev) => { const next = { ...prev }; delete next[check.id]; return next })
    execChecks([check])
  }

  function onTypeChange(v: CheckType) {
    setType(v)
    setPrivilege(PRIVILEGES[v][0])
    setColumn('')
    setObject('')
  }

  const privilegeOptions = PRIVILEGES[type]
  const isAnyRunning = running.size > 0
  const canAdd = !!role && !!object && !!privilege

  return (
    <div className="flex flex-col gap-4">
      {/* Add check form */}
      <div className="border border-border rounded-lg p-4 bg-muted/30">
        <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Build a check</p>
        <div className="flex flex-wrap gap-2 items-end">
          {/* Role */}
          <div className="flex flex-col gap-1 min-w-[140px]">
            <label className="text-xs text-muted-foreground">Role</label>
            {roles.length > 0 ? (
              <Select value={role} onValueChange={(v) => v && setRole(v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Pick role…" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.oid} value={r.rolname} className="text-xs">{r.rolname}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                className="h-8 text-xs"
                placeholder="rolename"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            )}
          </div>

          {/* Object type */}
          <div className="flex flex-col gap-1 min-w-[110px]">
            <label className="text-xs text-muted-foreground">Type</label>
            <Select value={type} onValueChange={(v) => v && onTypeChange(v as CheckType)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRIVILEGES) as CheckType[]).map((t) => (
                  <SelectItem key={t} value={t} className="text-xs capitalize">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Object picker */}
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground">Object</label>
            <ObjectPicker connection={connection} type={type} value={object} onChange={setObject} />
          </div>

          {/* Column name (only for 'column' type) */}
          {type === 'column' && (
            <div className="flex flex-col gap-1 min-w-[120px]">
              <label className="text-xs text-muted-foreground">Column</label>
              <Input
                className="h-8 text-xs font-mono"
                placeholder="email"
                value={column}
                onChange={(e) => setColumn(e.target.value)}
              />
            </div>
          )}

          {/* Privilege */}
          <div className="flex flex-col gap-1 min-w-[110px]">
            <label className="text-xs text-muted-foreground">Privilege</label>
            <Select value={privilege} onValueChange={(v) => v && setPrivilege(v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {privilegeOptions.map((p) => (
                  <SelectItem key={p} value={p} className="text-xs font-mono">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Run check button */}
          <Button
            size="sm"
            className="h-8 mt-[18px]"
            onClick={addAndRun}
            disabled={!canAdd || isAnyRunning}
          >
            {isAnyRunning
              ? <Loader2 size={14} className="mr-1 animate-spin" />
              : <Play size={14} className="mr-1" />}
            Run check
          </Button>
        </div>

        {/* Live SQL preview */}
        {canAdd && (
          <pre className="mt-3 rounded bg-black/5 dark:bg-white/5 px-3 py-2 text-[11px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap break-all border border-border/50">
            {buildCheckSql({ type, role, object, column, privilege })}
          </pre>
        )}
      </div>

      {/* Results list */}
      {checks.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{checks.length} check{checks.length !== 1 ? 's' : ''}</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => { setChecks([]); setResults({}) }}
              >
                <RotateCcw size={12} className="mr-1" />
                Clear all
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => execChecks(checks)}
                disabled={isAnyRunning}
              >
                {isAnyRunning
                  ? <Loader2 size={14} className="mr-1 animate-spin" />
                  : <Play size={14} className="mr-1" />}
                Re-run all
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs w-[130px]">Role</TableHead>
                  <TableHead className="text-xs w-[80px]">Type</TableHead>
                  <TableHead className="text-xs">Object</TableHead>
                  <TableHead className="text-xs w-[100px]">Privilege</TableHead>
                  <TableHead className="text-xs w-[120px]">Result</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {checks.map((c) => {
                  const res = results[c.id]
                  const isRowRunning = running.has(c.id)
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.role}</TableCell>
                      <TableCell className="text-xs capitalize">{c.type}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {c.object}{c.column ? `.${c.column}` : ''}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-mono">{c.privilege}</Badge>
                      </TableCell>
                      <TableCell>
                        {isRowRunning ? (
                          <Loader2 size={14} className="animate-spin text-muted-foreground" />
                        ) : res ? (
                          <div className="flex items-center gap-1.5">
                            <ResultIcon granted={res.granted} error={res.error} />
                            <ResultBadge granted={res.granted} error={res.error} />
                            {res.error && (
                              <span className="text-[10px] text-red-500 truncate max-w-[160px]" title={res.error}>
                                {res.error}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/30 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-0.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                            title="Re-run this check"
                            onClick={() => rerunCheck(c)}
                            disabled={isRowRunning}
                          >
                            <Play size={11} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            title="Remove"
                            onClick={() => removeCheck(c.id)}
                          >
                            <Trash2 size={11} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {checks.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Select a role, object type, object, and privilege above — then click <strong>Run check</strong>.
        </div>
      )}
    </div>
  )
}

// ─── SQL Executor tab ─────────────────────────────────────────────────────────

function SqlExecutor({ connection }: { connection: ServerConnection }) {
  const [sql, setSql] = useState('')
  const [role, setRole] = useState<string>('')
  const [result, setResult] = useState<{
    columns: string[]
    rows: Record<string, unknown>[]
    rowCount: number
    rolledBack: boolean
    error?: string
  } | null>(null)

  const { data: rolesData } = useQuery({
    queryKey: ['roles', connection.id],
    queryFn: async () => {
      const res = await fetch('/api/pg/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection }),
      })
      return res.json() as Promise<PgRole[]>
    },
  })

  const roles = rolesData ?? []

  const mutation = useMutation({
    mutationFn: () => executeSQL(connection, sql, role || null),
    onSuccess: setResult,
  })

  return (
    <div className="flex flex-col gap-4">
      {/* Notice */}
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>
          SQL runs inside a transaction that is always <strong>rolled back</strong> — no data will be modified.
          DDL that auto-commits (e.g. <code className="font-mono">CREATE DATABASE</code>) may still take effect.
        </span>
      </div>

      {/* Controls */}
      <div className="flex gap-2 items-end">
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-xs text-muted-foreground">Execute as role</label>
          <Select value={role} onValueChange={(v) => setRole(v ?? '')}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Connected user (default)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="" className="text-xs italic text-muted-foreground">Connected user (default)</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r.oid} value={r.rolname} className="text-xs">{r.rolname}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          className="h-8 ml-auto"
          onClick={() => mutation.mutate()}
          disabled={!sql.trim() || mutation.isPending}
        >
          {mutation.isPending
            ? <Loader2 size={14} className="mr-1 animate-spin" />
            : <Play size={14} className="mr-1" />}
          Execute
        </Button>
      </div>

      {/* SQL textarea */}
      <textarea
        className="w-full min-h-[160px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        placeholder={"-- Try a query as the selected role\nSELECT current_user, session_user;\nSELECT * FROM public.my_table LIMIT 5;"}
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        spellCheck={false}
      />

      {/* Result */}
      {result && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Result</span>
            {result.error ? (
              <Badge variant="destructive" className="text-[10px]">Error</Badge>
            ) : (
              <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 text-[10px]">
                {result.rowCount} row{result.rowCount !== 1 ? 's' : ''}
              </Badge>
            )}
            {result.rolledBack && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                <RotateCcw size={10} className="mr-1" />
                Rolled back
              </Badge>
            )}
          </div>

          {result.error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-mono text-destructive whitespace-pre-wrap">
              {result.error}
            </div>
          ) : result.columns.length > 0 ? (
            <div className="rounded-md border border-border overflow-auto max-h-[320px]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    {result.columns.map((col) => (
                      <TableHead key={col} className="text-xs font-mono">{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((row, i) => (
                    <TableRow key={i}>
                      {result.columns.map((col) => (
                        <TableCell key={col} className="text-xs font-mono">
                          {row[col] === null
                            ? <span className="text-muted-foreground/50 italic">null</span>
                            : String(row[col])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground italic px-1">
              Query executed successfully — no rows returned.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TestGround() {
  const { selected: selectedServer } = useServerContext()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Test Ground</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Check whether a role has specific privileges, or execute SQL as a given role.
          </p>
        </div>
        <ServerSelect />
      </div>

      {!selectedServer ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Select a server to get started.
        </div>
      ) : (
        <Tabs defaultValue="checker">
          <TabsList className="mb-2">
            <TabsTrigger value="checker">Permission Checker</TabsTrigger>
            <TabsTrigger value="executor">SQL Executor</TabsTrigger>
          </TabsList>

          <TabsContent value="checker">
            <PermissionChecker connection={selectedServer} />
          </TabsContent>

          <TabsContent value="executor">
            <SqlExecutor connection={selectedServer} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
