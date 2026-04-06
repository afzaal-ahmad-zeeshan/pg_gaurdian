import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db/client'
import { getManagementRights } from '@/lib/db/queries'

export async function POST(req: NextRequest) {
  const { connection } = await req.json()
  if (!connection) return NextResponse.json({ error: 'Missing connection' }, { status: 400 })
  const rights = await getManagementRights(getPool(connection))
  return NextResponse.json(rights)
}
