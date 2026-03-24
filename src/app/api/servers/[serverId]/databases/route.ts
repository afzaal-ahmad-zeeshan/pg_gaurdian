import { NextRequest, NextResponse } from 'next/server'
import { getServer } from '@/lib/servers'
import { getPool } from '@/lib/db/client'
import { getDatabases } from '@/lib/db/queries'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params
  const server = getServer(serverId)
  if (!server) return NextResponse.json({ error: 'Server not found' }, { status: 404 })
  const databases = await getDatabases(getPool(server))
  return NextResponse.json(databases)
}
