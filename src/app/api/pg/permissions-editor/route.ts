import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db/client'

export interface ApplyStatementResult {
  sql: string
  ok: boolean
  error?: string
}

export interface ValidateStatementResult {
  sql: string
  ok: boolean
  error?: string
}

export interface ValidateResponse {
  connectedUser: string
  isSuperuser: boolean
  results: ValidateStatementResult[]
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { connection, mode } = body

  if (!connection) return NextResponse.json({ error: 'Missing connection' }, { status: 400 })

  const pool = getPool(connection)

  // ── Validate: dry-run every statement inside a transaction that always rolls back ──
  // Each statement is tested independently via SAVEPOINTs so a failing statement
  // does not abort evaluation of subsequent ones.  The whole transaction is rolled
  // back at the end regardless of outcome, so no actual changes are made.
  if (mode === 'validate') {
    const { statements } = body as { statements: string[] }

    if (!Array.isArray(statements) || statements.length === 0) {
      return NextResponse.json({ error: 'No statements provided' }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      const { rows: userRows } = await client.query<{ username: string; rolsuper: boolean }>(
        `SELECT current_user AS username, r.rolsuper
           FROM pg_catalog.pg_roles r WHERE r.rolname = current_user`,
      )
      const { username, rolsuper } = userRows[0] ?? { username: 'unknown', rolsuper: false }

      await client.query('BEGIN')
      const results: ValidateStatementResult[] = []

      for (const sql of statements) {
        await client.query('SAVEPOINT _validate')
        try {
          await client.query(sql)
          await client.query('RELEASE SAVEPOINT _validate')
          results.push({ sql, ok: true })
        } catch (err) {
          await client.query('ROLLBACK TO SAVEPOINT _validate')
          results.push({ sql, ok: false, error: err instanceof Error ? err.message : String(err) })
        }
      }

      // Always rollback — this is a dry run; no changes should persist
      await client.query('ROLLBACK')

      return NextResponse.json({
        connectedUser: username,
        isSuperuser: rolsuper,
        results,
      } satisfies ValidateResponse)
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    } finally {
      client.release()
    }
  }

  // ── Apply GRANT / REVOKE statements individually (no transaction wrap) ───────
  // Each statement is attempted independently so partial success is possible.
  // The caller re-fetches the permissions matrix after this to verify final state.
  if (mode === 'apply') {
    const { statements } = body as { statements: string[] }

    if (!Array.isArray(statements) || statements.length === 0) {
      return NextResponse.json({ error: 'No statements provided' }, { status: 400 })
    }

    const results: ApplyStatementResult[] = []

    for (const sql of statements) {
      try {
        await pool.query(sql)
        results.push({ sql, ok: true })
      } catch (err) {
        results.push({ sql, ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    }

    const succeeded = results.filter((r) => r.ok).length
    const failed = results.filter((r) => !r.ok).length

    return NextResponse.json({ succeeded, failed, total: statements.length, results })
  }

  return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
}
