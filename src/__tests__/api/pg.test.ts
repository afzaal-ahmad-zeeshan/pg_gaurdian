/**
 * API Route Tests — /api/pg/*
 *
 * Covers:
 *   POST /api/pg/test        — connection health check
 *   POST /api/pg/databases   — list databases
 *   POST /api/pg/roles       — list / create / drop roles
 *   POST /api/pg/users       — list users + current user info
 *   POST /api/pg/permissions — permissions matrix for a role
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockServer, mockRoles, mockDatabases, mockCurrentUser, mockMatrix } from '../helpers'

// ─── Module mocks (hoisted) ───────────────────────────────────────────────
vi.mock('@/lib/db/client', () => ({ getPool: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({
  getDatabases: vi.fn(),
  getRoles: vi.fn(),
  createRole: vi.fn(),
  dropRole: vi.fn(),
  getUsers: vi.fn(),
  getCurrentUserInfo: vi.fn(),
  getTablePrivileges: vi.fn(),
  getPermissionsMatrix: vi.fn(),
}))

import { getPool } from '@/lib/db/client'
import {
  getDatabases,
  getRoles,
  createRole,
  dropRole,
  getUsers,
  getCurrentUserInfo,
  getPermissionsMatrix,
} from '@/lib/db/queries'
import { POST as testPost } from '@/app/api/pg/test/route'
import { POST as databasesPost } from '@/app/api/pg/databases/route'
import { POST as rolesPost } from '@/app/api/pg/roles/route'
import { POST as usersPost } from '@/app/api/pg/users/route'
import { POST as permissionsPost } from '@/app/api/pg/permissions/route'

const mockPool = { connect: vi.fn(), query: vi.fn() }

function makeReq(body: unknown, url = 'http://localhost/api/pg/test') {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any
}

beforeEach(() => {
  vi.mocked(getPool).mockReturnValue(mockPool as any)
})

// ─── POST /api/pg/test ────────────────────────────────────────────────────
describe('POST /api/pg/test', () => {
  it('returns { ok: true } when SELECT 1 succeeds', async () => {
    const mockClient = { query: vi.fn(), release: vi.fn() }
    mockPool.connect.mockResolvedValueOnce(mockClient)
    mockClient.query.mockResolvedValueOnce({})

    const res = await testPost(makeReq({ connection: mockServer }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockClient.query).toHaveBeenCalledWith('SELECT 1')
    expect(mockClient.release).toHaveBeenCalled()
  })

  it('returns { ok: false, error } when connection throws', async () => {
    mockPool.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const res = await testPost(makeReq({ connection: mockServer }))
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toBe('ECONNREFUSED')
  })

  it('returns 400 when connection is missing', async () => {
    const res = await testPost(makeReq({}))
    expect(res.status).toBe(400)
  })
})

// ─── POST /api/pg/databases ───────────────────────────────────────────────
describe('POST /api/pg/databases', () => {
  it('returns database list from getDatabases', async () => {
    vi.mocked(getDatabases).mockResolvedValueOnce(mockDatabases)

    const res = await databasesPost(makeReq({ connection: mockServer }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(2)
    expect(body[0].datname).toBe('postgres')
  })

  it('returns 400 when connection is missing', async () => {
    const res = await databasesPost(makeReq({}))
    expect(res.status).toBe(400)
  })
})

// ─── POST /api/pg/roles ───────────────────────────────────────────────────
describe('POST /api/pg/roles', () => {
  it('returns all roles when action is "list"', async () => {
    vi.mocked(getRoles).mockResolvedValueOnce(mockRoles)

    const res = await rolesPost(makeReq({ connection: mockServer, action: 'list' }))
    const body = await res.json()
    expect(body).toHaveLength(2)
    expect(body[0].rolname).toBe('admin')
  })

  it('returns all roles when action is omitted (default list)', async () => {
    vi.mocked(getRoles).mockResolvedValueOnce(mockRoles)

    const res = await rolesPost(makeReq({ connection: mockServer }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it('creates a role and returns 201', async () => {
    vi.mocked(createRole).mockResolvedValueOnce(undefined)

    const res = await rolesPost(
      makeReq({ connection: mockServer, action: 'create', rolename: 'newrole', options: { canLogin: true } }),
    )
    expect(res.status).toBe(201)
    expect(vi.mocked(createRole)).toHaveBeenCalledWith(mockPool, 'newrole', { canLogin: true })
  })

  it('drops a role and returns 200', async () => {
    vi.mocked(dropRole).mockResolvedValueOnce(undefined)

    const res = await rolesPost(
      makeReq({ connection: mockServer, action: 'drop', rolename: 'oldrole' }),
    )
    expect(res.status).toBe(200)
    expect(vi.mocked(dropRole)).toHaveBeenCalledWith(mockPool, 'oldrole')
  })

  it('returns 400 for unknown action', async () => {
    const res = await rolesPost(makeReq({ connection: mockServer, action: 'explode' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when connection is missing', async () => {
    const res = await rolesPost(makeReq({}))
    expect(res.status).toBe(400)
  })
})

// ─── POST /api/pg/users ───────────────────────────────────────────────────
describe('POST /api/pg/users', () => {
  it('returns { users, currentUser } on success', async () => {
    vi.mocked(getUsers).mockResolvedValueOnce(mockRoles)
    vi.mocked(getCurrentUserInfo).mockResolvedValueOnce(mockCurrentUser)

    const res = await usersPost(makeReq({ connection: mockServer }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.users).toHaveLength(2)
    expect(body.currentUser.username).toBe('testuser')
  })

  it('returns 400 when connection is missing', async () => {
    const res = await usersPost(makeReq({}))
    expect(res.status).toBe(400)
  })
})

// ─── POST /api/pg/permissions ─────────────────────────────────────────────
describe('POST /api/pg/permissions', () => {
  it('returns the permissions matrix for the given role', async () => {
    vi.mocked(getPermissionsMatrix).mockResolvedValueOnce(mockMatrix)

    const res = await permissionsPost(makeReq({ connection: mockServer, rolename: 'admin' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rolename).toBe('admin')
    expect(body.databases).toHaveLength(2)
    expect(body.schemas).toHaveLength(1)
    expect(body.tables).toHaveLength(2)
    expect(vi.mocked(getPermissionsMatrix)).toHaveBeenCalledWith(mockPool, 'admin')
  })

  it('returns 400 when connection is missing', async () => {
    const res = await permissionsPost(makeReq({ rolename: 'admin' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when rolename is missing', async () => {
    const res = await permissionsPost(makeReq({ connection: mockServer }))
    expect(res.status).toBe(400)
  })
})
