// Superseded by /api/pg/databases. Kept as a stub to avoid 404s.
import { NextResponse } from 'next/server'
export async function GET() {
  return NextResponse.json({ error: 'Use POST /api/pg/databases' }, { status: 410 })
}
