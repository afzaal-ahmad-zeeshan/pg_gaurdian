import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db/client'

export async function POST(req: NextRequest) {
  const { connection } = await req.json()
  if (!connection) return NextResponse.json({ error: 'Missing connection' }, { status: 400 })
  try {
    const pool = getPool(connection)
    const client = await pool.connect()
    await client.query('SELECT 1')
    client.release()
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message })
  }
}
