// Superseded by /api/pg/roles. Kept as a stub to avoid 404s.
import { NextResponse } from 'next/server'
export async function GET() {
  return NextResponse.json({ error: 'Use POST /api/pg/roles' }, { status: 410 })
}
export async function POST() {
  return NextResponse.json({ error: 'Use POST /api/pg/roles' }, { status: 410 })
}
export async function DELETE() {
  return NextResponse.json({ error: 'Use POST /api/pg/roles' }, { status: 410 })
}
