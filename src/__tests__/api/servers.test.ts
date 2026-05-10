/**
 * API Route Tests — /api/servers/*
 *
 * All routes under /api/servers/ are superseded stubs.
 * Credentials are browser-only; the server never reads them from disk.
 *
 * Covers:
 *   GET  /api/servers                  — stub (returns [])
 *   GET  /api/servers/[id]/test        — deprecated, returns 410
 *   GET  /api/servers/[id]/databases   — deprecated, returns 410
 *   GET  /api/servers/[id]/roles       — deprecated, returns 410
 *   POST /api/servers/[id]/roles       — deprecated, returns 410
 *   DELETE /api/servers/[id]/roles     — deprecated, returns 410
 */
import { describe, it, expect } from 'vitest'

import { GET as serversGet } from '@/app/api/servers/route'
import { GET as testGet } from '@/app/api/servers/[serverId]/test/route'
import { GET as dbGet } from '@/app/api/servers/[serverId]/databases/route'
import {
  GET as rolesGet,
  POST as rolesPost,
  DELETE as rolesDelete,
} from '@/app/api/servers/[serverId]/roles/route'

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
  it('returns 410 Gone (superseded stub)', async () => {
    const res = await dbGet()
    expect(res.status).toBe(410)
    const body = await res.json()
    expect(body.error).toMatch(/\/api\/pg\/databases/i)
  })
})

// ─── /api/servers/[id]/roles ─────────────────────────────────────────────
describe('/api/servers/[id]/roles', () => {
  it('GET returns 410 Gone', async () => {
    const res = await rolesGet()
    expect(res.status).toBe(410)
  })

  it('POST returns 410 Gone', async () => {
    const res = await rolesPost()
    expect(res.status).toBe(410)
  })

  it('DELETE returns 410 Gone', async () => {
    const res = await rolesDelete()
    expect(res.status).toBe(410)
  })
})
