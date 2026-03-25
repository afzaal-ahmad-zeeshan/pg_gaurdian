import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db/client'
import { getUsers, getCurrentUserInfo } from '@/lib/db/queries'

export async function POST(req: NextRequest) {
  const { connection } = await req.json()
  if (!connection) return NextResponse.json({ error: 'Missing connection' }, { status: 400 })
  const pool = getPool(connection)
  const [users, currentUser] = await Promise.all([getUsers(pool), getCurrentUserInfo(pool)])
  return NextResponse.json({ users, currentUser })
}
