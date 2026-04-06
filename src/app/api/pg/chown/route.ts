import { NextRequest, NextResponse } from 'next/server'
import type { Pool } from 'pg'
import { getPool } from '@/lib/db/client'

export type ChownObjectType = 'database' | 'schema' | 'table' | 'sequence' | 'function' | 'type'

export interface ChildObject {
  kind: string
  name: string
  owner: string
}

function qi(s: string) {
  return `"${s.replace(/"/g, '""')}"`
}

// ── Build ALTER ... OWNER TO SQL ─────────────────────────────────────────────

function buildAlterOwnerSql(type: ChownObjectType, object: string, newOwner: string): string {
  switch (type) {
    case 'database':
      return `ALTER DATABASE ${qi(object)} OWNER TO ${qi(newOwner)}`
    case 'schema':
      return `ALTER SCHEMA ${qi(object)} OWNER TO ${qi(newOwner)}`
    case 'table': {
      const dot = object.indexOf('.')
      return `ALTER TABLE ${qi(object.slice(0, dot))}.${qi(object.slice(dot + 1))} OWNER TO ${qi(newOwner)}`
    }
    case 'sequence': {
      const dot = object.indexOf('.')
      return `ALTER SEQUENCE ${qi(object.slice(0, dot))}.${qi(object.slice(dot + 1))} OWNER TO ${qi(newOwner)}`
    }
    case 'function': {
      const dot = object.indexOf('.')
      const paren = object.indexOf('(')
      return `ALTER FUNCTION ${qi(object.slice(0, dot))}.${qi(object.slice(dot + 1, paren))}${object.slice(paren)} OWNER TO ${qi(newOwner)}`
    }
    case 'type': {
      const dot = object.indexOf('.')
      return `ALTER TYPE ${qi(object.slice(0, dot))}.${qi(object.slice(dot + 1))} OWNER TO ${qi(newOwner)}`
    }
  }
}

// ── Verify owner in catalog after execute ────────────────────────────────────

async function verifyOwner(
  pool: Pool,
  type: ChownObjectType,
  object: string,
  expectedOwner: string,
): Promise<{ actualOwner: string | null; verified: boolean }> {
  try {
    let sql: string
    let params: string[]
    switch (type) {
      case 'database':
        sql = `SELECT pg_get_userbyid(datdba) AS owner FROM pg_catalog.pg_database WHERE datname = $1`
        params = [object]
        break
      case 'schema':
        sql = `SELECT pg_get_userbyid(nspowner) AS owner FROM pg_catalog.pg_namespace WHERE nspname = $1`
        params = [object]
        break
      case 'table':
      case 'sequence': {
        const dot = object.indexOf('.')
        sql = `SELECT pg_get_userbyid(c.relowner) AS owner
               FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = $1 AND c.relname = $2`
        params = [object.slice(0, dot), object.slice(dot + 1)]
        break
      }
      case 'function': {
        const dot = object.indexOf('.')
        const paren = object.indexOf('(')
        sql = `SELECT pg_get_userbyid(p.proowner) AS owner
               FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = $1 AND p.proname = $2
                 AND pg_get_function_identity_arguments(p.oid) = $3`
        params = [object.slice(0, dot), object.slice(dot + 1, paren), object.slice(paren + 1, -1)]
        break
      }
      case 'type': {
        const dot = object.indexOf('.')
        sql = `SELECT pg_get_userbyid(t.typowner) AS owner
               FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
               WHERE n.nspname = $1 AND t.typname = $2`
        params = [object.slice(0, dot), object.slice(dot + 1)]
        break
      }
      default:
        return { actualOwner: null, verified: false }
    }
    const { rows } = await pool.query<{ owner: string }>(sql, params)
    const actualOwner = rows[0]?.owner ?? null
    return { actualOwner, verified: actualOwner === expectedOwner }
  } catch {
    return { actualOwner: null, verified: false }
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { connection, mode } = body

  if (!connection) return NextResponse.json({ error: 'Missing connection' }, { status: 400 })

  const pool = getPool(connection)

  // ── List objects with their current owner ────────────────────────────────────
  if (mode === 'resources') {
    const { type } = body as { type: ChownObjectType }
    try {
      let sql: string
      switch (type) {
        case 'database':
          sql = `SELECT datname AS name, pg_get_userbyid(datdba) AS owner
                 FROM pg_catalog.pg_database WHERE NOT datistemplate ORDER BY datname`
          break
        case 'schema':
          sql = `SELECT nspname AS name, pg_get_userbyid(nspowner) AS owner
                 FROM pg_catalog.pg_namespace
                 WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
                 ORDER BY nspname`
          break
        case 'table':
          sql = `SELECT n.nspname||'.'||c.relname AS name, pg_get_userbyid(c.relowner) AS owner
                 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                 WHERE c.relkind IN ('r','v','m','f','p')
                   AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
                 ORDER BY name`
          break
        case 'sequence':
          sql = `SELECT n.nspname||'.'||c.relname AS name, pg_get_userbyid(c.relowner) AS owner
                 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                 WHERE c.relkind = 'S'
                   AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
                 ORDER BY name`
          break
        case 'function':
          sql = `SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS name,
                        pg_get_userbyid(p.proowner) AS owner
                 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
                 ORDER BY name`
          break
        case 'type':
          sql = `SELECT n.nspname||'.'||t.typname AS name, pg_get_userbyid(t.typowner) AS owner
                 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typtype NOT IN ('p','b')
                   AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
                 ORDER BY name`
          break
        default:
          return NextResponse.json({ objects: [] })
      }
      const { rows } = await pool.query<{ name: string; owner: string }>(sql)
      return NextResponse.json({ objects: rows })
    } catch {
      return NextResponse.json({ objects: [] })
    }
  }

  // ── Find child objects still owned by the old owner ──────────────────────────
  // These are objects that won't be moved automatically and will become "stale"
  // after the parent's ownership is transferred.
  if (mode === 'children') {
    const { type, object, owner } = body as { type: ChownObjectType; object: string; owner: string }
    try {
      let sql: string
      let params: string[]

      switch (type) {
        // Database → schemas owned by the same role
        case 'database':
          sql = `SELECT 'schema' AS kind, nspname AS name, pg_get_userbyid(nspowner) AS owner
                 FROM pg_catalog.pg_namespace
                 WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
                   AND pg_get_userbyid(nspowner) = $1
                 ORDER BY nspname`
          params = [owner]
          break

        // Schema → tables, sequences, functions, types in that schema owned by the same role
        case 'schema':
          sql = `
            SELECT 'table'    AS kind, n.nspname||'.'||c.relname AS name, pg_get_userbyid(c.relowner) AS owner
            FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = $1 AND c.relkind IN ('r','v','m','f','p')
              AND pg_get_userbyid(c.relowner) = $2
            UNION ALL
            SELECT 'sequence', n.nspname||'.'||c.relname, pg_get_userbyid(c.relowner)
            FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = $1 AND c.relkind = 'S'
              AND pg_get_userbyid(c.relowner) = $2
            UNION ALL
            SELECT 'function',
                   n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
                   pg_get_userbyid(p.proowner)
            FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = $1 AND pg_get_userbyid(p.proowner) = $2
            UNION ALL
            SELECT 'type', n.nspname||'.'||t.typname, pg_get_userbyid(t.typowner)
            FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = $1 AND t.typtype NOT IN ('p','b')
              AND pg_get_userbyid(t.typowner) = $2
            ORDER BY kind, name`
          params = [object, owner]
          break

        // Table → sequences auto-linked via column dependency (SERIAL / BIGSERIAL / OWNED BY)
        case 'table':
          sql = `SELECT 'sequence' AS kind, n.nspname||'.'||c.relname AS name, pg_get_userbyid(c.relowner) AS owner
                 FROM pg_catalog.pg_class c
                 JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                 WHERE c.relkind = 'S'
                   AND pg_get_userbyid(c.relowner) = $2
                   AND c.oid IN (
                     SELECT d.objid
                     FROM pg_catalog.pg_depend d
                     JOIN pg_catalog.pg_class ct ON ct.oid = d.refobjid
                     JOIN pg_catalog.pg_namespace nt ON nt.oid = ct.relnamespace
                     WHERE d.deptype = 'a'
                       AND nt.nspname||'.'||ct.relname = $1
                   )
                 ORDER BY name`
          params = [object, owner]
          break

        // Sequences, functions, types are leaves — no children
        default:
          return NextResponse.json({ children: [] })
      }

      const { rows } = await pool.query<ChildObject>(sql, params)
      return NextResponse.json({ children: rows })
    } catch {
      return NextResponse.json({ children: [] })
    }
  }

  // ── Execute batch ALTER ... OWNER TO in a single transaction ─────────────────
  if (mode === 'execute') {
    const { transfers, newOwner } = body as {
      transfers: Array<{ type: ChownObjectType; object: string }>
      newOwner: string
    }

    if (!transfers?.length || !newOwner) {
      return NextResponse.json({ error: 'Missing transfers or newOwner' }, { status: 400 })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const results: Array<{ type: string; object: string; sql: string; ok: boolean; error?: string }> = []

      for (const { type, object } of transfers) {
        const sql = buildAlterOwnerSql(type, object, newOwner)
        try {
          await client.query(sql)
          results.push({ type, object, sql, ok: true })
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          results.push({ type, object, sql, ok: false, error })
          await client.query('ROLLBACK')
          return NextResponse.json({ ok: false, results, rolledBack: true })
        }
      }

      await client.query('COMMIT')

      // Verify the primary (first) transfer
      const primary = transfers[0]
      const { actualOwner, verified } = await verifyOwner(pool, primary.type, primary.object, newOwner)

      return NextResponse.json({ ok: true, results, rolledBack: false, newOwner, actualOwner, verified })
    } catch (err) {
      try { await client.query('ROLLBACK') } catch { /* ignore */ }
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : String(err), rolledBack: true },
        { status: 500 },
      )
    } finally {
      client.release()
    }
  }

  return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
}
