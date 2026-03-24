import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db/client'
import { getRoles, createRole, dropRole } from '@/lib/db/queries'

export async function POST(req: NextRequest) {
  const { connection, action, rolename, options } = await req.json()
  if (!connection) return NextResponse.json({ error: 'Missing connection' }, { status: 400 })
  const pool = getPool(connection)

  if (!action || action === 'list') {
    const roles = await getRoles(pool)
    return NextResponse.json(roles)
  }
  if (action === 'create') {
    await createRole(pool, rolename, options ?? {})
    return NextResponse.json({ ok: true }, { status: 201 })
  }
  if (action === 'drop') {
    await dropRole(pool, rolename)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
