import { NextRequest, NextResponse } from 'next/server'
import { getServer } from '@/lib/servers'
import { getPool } from '@/lib/db/client'
import { getRoles, createRole, dropRole } from '@/lib/db/queries'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params
  const server = getServer(serverId)
  if (!server) return NextResponse.json({ error: 'Server not found' }, { status: 404 })
  const roles = await getRoles(getPool(server))
  return NextResponse.json(roles)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params
  const server = getServer(serverId)
  if (!server) return NextResponse.json({ error: 'Server not found' }, { status: 404 })
  const body = await req.json()
  await createRole(getPool(server), body.rolename, body.options ?? {})
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params
  const server = getServer(serverId)
  if (!server) return NextResponse.json({ error: 'Server not found' }, { status: 404 })
  const { rolename } = await req.json()
  await dropRole(getPool(server), rolename)
  return NextResponse.json({ ok: true })
}
