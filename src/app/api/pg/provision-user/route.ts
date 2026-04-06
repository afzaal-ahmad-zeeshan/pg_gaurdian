import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db/client'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { connection, action } = body
  if (!connection) return NextResponse.json({ error: 'Missing connection' }, { status: 400 })

  const pool = getPool(connection)

  if (!action || action === 'resources') {
    const [schemasRes, tablesRes, rolesRes, dbsRes] = await Promise.all([
      pool.query<{ name: string }>(`
        SELECT nspname AS name
        FROM pg_catalog.pg_namespace
        WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
        ORDER BY nspname
      `),
      pool.query<{ schema: string; name: string; kind: string }>(`
        SELECT n.nspname AS schema, c.relname AS name, c.relkind::text AS kind
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r','v','m','f','p')
          AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        ORDER BY n.nspname, c.relname
      `),
      pool.query<{ rolname: string }>(`SELECT rolname FROM pg_catalog.pg_roles ORDER BY rolname`),
      pool.query<{ datname: string }>(`SELECT datname FROM pg_catalog.pg_database WHERE datistemplate = false ORDER BY datname`),
    ])
    return NextResponse.json({
      schemas: schemasRes.rows,
      tables: tablesRes.rows,
      roles: rolesRes.rows.map(r => r.rolname),
      databases: dbsRes.rows.map(d => d.datname),
    })
  }

  if (action === 'execute') {
    const { statements } = body
    if (!Array.isArray(statements) || statements.length === 0) {
      return NextResponse.json({ error: 'No statements provided' }, { status: 400 })
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const results: { sql: string; ok: boolean; error?: string }[] = []
      for (const sql of statements as string[]) {
        try {
          await client.query(sql)
          results.push({ sql, ok: true })
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          results.push({ sql, ok: false, error: message })
          await client.query('ROLLBACK')
          return NextResponse.json({ ok: false, results, rolledBack: true })
        }
      }
      await client.query('COMMIT')
      return NextResponse.json({ ok: true, results })
    } catch (err: unknown) {
      await client.query('ROLLBACK').catch(() => {})
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ ok: false, error: message }, { status: 500 })
    } finally {
      client.release()
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
