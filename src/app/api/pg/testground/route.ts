import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db/client'

export type CheckType = 'database' | 'schema' | 'table' | 'column' | 'sequence' | 'function'

export interface PermissionCheck {
  id: string
  role: string
  type: CheckType
  object: string
  column?: string
  privilege: string
}

export interface CheckResult {
  id: string
  granted: boolean | null
  error?: string
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { connection, mode } = body

  if (!connection) return NextResponse.json({ error: 'Missing connection' }, { status: 400 })

  const pool = getPool(connection)

  // ── Object list for dropdowns ───────────────────────────────────────────────
  if (mode === 'resources') {
    const { type } = body as { type: string }
    try {
      let sql: string
      switch (type) {
        case 'database':
          sql = `SELECT datname AS name FROM pg_catalog.pg_database WHERE NOT datistemplate ORDER BY datname`
          break
        case 'schema':
          sql = `SELECT nspname AS name FROM pg_catalog.pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY nspname`
          break
        case 'table':
          sql = `SELECT n.nspname||'.'||c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','v','m','f','p') AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY name`
          break
        case 'column':
          sql = `SELECT DISTINCT n.nspname||'.'||c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','v','m') AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY name`
          break
        case 'sequence':
          sql = `SELECT n.nspname||'.'||c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S' AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY name`
          break
        case 'function':
          sql = `SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS name FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY name`
          break
        default:
          return NextResponse.json({ objects: [] })
      }
      const { rows } = await pool.query<{ name: string }>(sql)
      return NextResponse.json({ objects: rows.map((r) => r.name) })
    } catch {
      return NextResponse.json({ objects: [] })
    }
  }

  // ── Permission checker ─────────────────────────────────────────────────────
  if (mode === 'check') {
    const checks: PermissionCheck[] = body.checks ?? []
    const results: CheckResult[] = []

    for (const check of checks) {
      try {
        let sql: string
        let params: unknown[]

        switch (check.type) {
          case 'database':
            sql = `SELECT has_database_privilege($1, $2, $3) AS granted`
            params = [check.role, check.object, check.privilege]
            break
          case 'schema':
            sql = `SELECT has_schema_privilege($1, $2, $3) AS granted`
            params = [check.role, check.object, check.privilege]
            break
          case 'table':
            sql = `SELECT has_table_privilege($1, $2, $3) AS granted`
            params = [check.role, check.object, check.privilege]
            break
          case 'column':
            sql = `SELECT has_column_privilege($1, $2, $3, $4) AS granted`
            params = [check.role, check.object, check.column ?? '', check.privilege]
            break
          case 'sequence':
            sql = `SELECT has_sequence_privilege($1, $2, $3) AS granted`
            params = [check.role, check.object, check.privilege]
            break
          case 'function':
            sql = `SELECT has_function_privilege($1, $2, $3) AS granted`
            params = [check.role, check.object, check.privilege]
            break
          default:
            results.push({ id: check.id, granted: null, error: 'Unknown check type' })
            continue
        }

        const { rows } = await pool.query(sql, params)
        results.push({ id: check.id, granted: rows[0]?.granted ?? null })
      } catch (err) {
        results.push({
          id: check.id,
          granted: null,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return NextResponse.json({ results })
  }

  // ── SQL executor ───────────────────────────────────────────────────────────
  if (mode === 'execute') {
    const { sql, role } = body
    if (!sql?.trim()) return NextResponse.json({ error: 'Missing sql' }, { status: 400 })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      if (role) {
        // Safely quote the role name — strip any embedded double-quotes first
        const safe = role.replace(/"/g, '')
        await client.query(`SET LOCAL ROLE "${safe}"`)
      }

      const result = await client.query(sql)
      const rows = result.rows
      const columns = result.fields?.map((f: { name: string }) => f.name) ?? []
      const rowCount = result.rowCount ?? rows.length

      await client.query('ROLLBACK')

      return NextResponse.json({ columns, rows, rowCount, rolledBack: true })
    } catch (err) {
      try { await client.query('ROLLBACK') } catch { /* ignore */ }
      return NextResponse.json({
        columns: [],
        rows: [],
        rowCount: 0,
        rolledBack: true,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      client.release()
    }
  }

  return NextResponse.json({ error: 'Invalid mode. Use "check" or "execute".' }, { status: 400 })
}
