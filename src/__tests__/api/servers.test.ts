/**
 * API Route Tests — /api/servers/*
 *
 * Covers:
 *   GET  /api/servers                       — stub (returns [])
 *   GET  /api/servers/[id]/test             — deprecated, returns 410
 *   GET  /api/servers/[id]/databases        — list databases for saved server
 *   GET  /api/servers/[id]/roles            — list roles for saved server
 *   POST /api/servers/[id]/roles            — create role
 *   DELETE /api/servers/[id]/roles          — drop role
 *   GET  /api/servers/[id]/... (unknown id) — 404
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockServer, mockRoles, mockDatabases } from '../helpers'

vi.mock('@/lib/servers', () => ({
  getServer: vi.fn(),
  getServers: vi.fn(),
  saveServer: vi.fn(),
  deleteServer: vi.fn(),
}))
vi.mock('@/lib/db/client', () => ({ getPool: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({
  getDatabases: vi.fn(),
  getRoles: vi.fn(),
  createRole: vi.fn(),
  dropRole: vi.fn(),
}))

import { getServer } from '@/lib/servers'
import { getPool } from '@/lib/db/client'
import { getDatabases, getRoles, createRole, dropRole } from '@/lib/db/queries'
import { GET as serversGet } from '@/app/api/servers/route'
import { GET as testGet } from '@/app/api/servers/[serverId]/test/route'
import { GET as dbGet } from '@/app/api/servers/[serverId]/databases/route'
import {
  GET as rolesGet,
  POST as rolesPost,
  DELETE as rolesDelete,
} from '@/app/api/servers/[serverId]/roles/route'

const mockPool = {}
const params = (id: string) => ({ params: Promise.resolve({ serverId: id }) })

function makeReq(method = 'GET', body?: unknown) {
  return new Request('http://localhost', {
    method,
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  }) as any
}

beforeEach(() => {
  vi.mocked(getPool).mockReturnValue(mockPool as any)
})

// ─── GET /api/servers ─────────────────────────────────────────────────────
describe('GET /api/servers', () => {
  it('returns an empty array (superseded stub)', async () => {
    const res = await serversGet()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })
})

// ─── GET /api/servers/[id]/test ───────────────────────────────────────────
describe('GET /api/servers/[id]/test', () => {
  it('returns 410 Gone (deprecated endpoint)', async () => {
    const res = await testGet()
    expect(res.status).toBe(410)
    const body = await res.json()
    expect(body.error).toMatch(/POST \/api\/pg\/test/i)
  })
})

// ─── GET /api/servers/[id]/databases ─────────────────────────────────────
describe('GET /api/servers/[id]/databases', () => {
  it('returns databases for a known server', async () => {
    vi.mocked(getServer).mockReturnValue(mockServer)
    vi.mocked(getDatabases).mockResolvedValueOnce(mockDatabases)

    const res = await dbGet(makeReq(), params('server-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(2)
  })

  it('returns 404 for unknown server', async () => {
    vi.mocked(getServer).mockReturnValue(undefined)

    const res = await dbGet(makeReq(), params('unknown'))
    expect(res.status).toBe(404)
  })
})

// ─── GET /api/servers/[id]/roles ─────────────────────────────────────────
describe('GET /api/servers/[id]/roles', () => {
  it('returns roles for a known server', async () => {
    vi.mocked(getServer).mockReturnValue(mockServer)
    vi.mocked(getRoles).mockResolvedValueOnce(mockRoles)

    const res = await rolesGet(makeReq(), params('server-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body[0].rolname).toBe('admin')
  })

  it('returns 404 for unknown server', async () => {
    vi.mocked(getServer).mockReturnValue(undefined)
    const res = await rolesGet(makeReq(), params('unknown'))
    expect(res.status).toBe(404)
  })
})

// ─── POST /api/servers/[id]/roles ────────────────────────────────────────
describe('POST /api/servers/[id]/roles', () => {
  it('creates a role and returns 201', async () => {
    vi.mocked(getServer).mockReturnValue(mockServer)
    vi.mocked(createRole).mockResolvedValueOnce(undefined)

    const res = await rolesPost(
      makeReq('POST', { rolename: 'newrole', options: { canLogin: true } }),
      params('server-1'),
    )
    expect(res.status).toBe(201)
    expect(vi.mocked(createRole)).toHaveBeenCalledWith(mockPool, 'newrole', { canLogin: true })
  })

  it('returns 404 for unknown server', async () => {
    vi.mocked(getServer).mockReturnValue(undefined)
    const res = await rolesPost(makeReq('POST', { rolename: 'x', options: {} }), params('nope'))
    expect(res.status).toBe(404)
  })
})

// ─── DELETE /api/servers/[id]/roles ──────────────────────────────────────
describe('DELETE /api/servers/[id]/roles', () => {
  it('drops a role and returns 200', async () => {
    vi.mocked(getServer).mockReturnValue(mockServer)
    vi.mocked(dropRole).mockResolvedValueOnce(undefined)

    const res = await rolesDelete(
      makeReq('DELETE', { rolename: 'oldrole' }),
      params('server-1'),
    )
    expect(res.status).toBe(200)
    expect(vi.mocked(dropRole)).toHaveBeenCalledWith(mockPool, 'oldrole')
  })

  it('returns 404 for unknown server', async () => {
    vi.mocked(getServer).mockReturnValue(undefined)
    const res = await rolesDelete(makeReq('DELETE', { rolename: 'x' }), params('nope'))
    expect(res.status).toBe(404)
  })
})
