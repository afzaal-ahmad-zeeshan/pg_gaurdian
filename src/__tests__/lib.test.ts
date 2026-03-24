import { describe, it, expect } from 'vitest'

/**
 * Pure-function unit tests — no database required.
 */

// Inline the poolKey logic so we can test it without importing the whole pg module
function poolKey(s: { host: string; port: number; database: string; user: string }) {
  return `${s.host}:${s.port}/${s.database}@${s.user}`
}

describe('poolKey', () => {
  it('produces a consistent key from connection fields', () => {
    const key = poolKey({ host: 'localhost', port: 5432, database: 'postgres', user: 'admin' })
    expect(key).toBe('localhost:5432/postgres@admin')
  })

  it('produces different keys for different users', () => {
    const a = poolKey({ host: 'localhost', port: 5432, database: 'postgres', user: 'alice' })
    const b = poolKey({ host: 'localhost', port: 5432, database: 'postgres', user: 'bob' })
    expect(a).not.toBe(b)
  })
})

// memberof normalization (mirrors the logic in getRoles)
function normalizeMemberof(memberof: unknown): string[] {
  return Array.isArray(memberof) ? memberof : []
}

describe('memberof normalization', () => {
  it('passes arrays through unchanged', () => {
    expect(normalizeMemberof(['pg_read', 'app_user'])).toEqual(['pg_read', 'app_user'])
  })

  it('converts null to empty array', () => {
    expect(normalizeMemberof(null)).toEqual([])
  })

  it('converts undefined to empty array', () => {
    expect(normalizeMemberof(undefined)).toEqual([])
  })

  it('converts unexpected string to empty array', () => {
    expect(normalizeMemberof('{pg_read,app_user}')).toEqual([])
  })
})
