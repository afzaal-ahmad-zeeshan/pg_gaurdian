import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db/client'

export interface ApplyStatementResult {
  sql: string
  ok: boolean
  error?: string
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { connection, mode } = body

  if (!connection) return NextResponse.json({ error: 'Missing connection' }, { status: 400 })

  const pool = getPool(connection)

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
