// Superseded by /api/pg/test
import { NextResponse } from 'next/server'
export async function GET() {
  return NextResponse.json({ error: 'Use POST /api/pg/test' }, { status: 410 })
}
