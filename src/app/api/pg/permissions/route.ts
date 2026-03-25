import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db/client'
import { getPermissionsMatrix } from '@/lib/db/queries'

export async function POST(req: NextRequest) {
  const { connection, rolename } = await req.json()
  if (!connection) return NextResponse.json({ error: 'Missing connection' }, { status: 400 })
  if (!rolename) return NextResponse.json({ error: 'Missing rolename' }, { status: 400 })
  const matrix = await getPermissionsMatrix(getPool(connection), rolename)
  return NextResponse.json(matrix)
}
