/**
 * Server Store Tests — src/lib/servers.ts
 *
 * Covers: getServers, getServer, saveServer, deleteServer
 * Uses vi.spyOn to intercept fs calls without touching the filesystem.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import { mockServer, mockServer2 } from './helpers'

// We need to import the module AFTER setting up spies because
// the module keeps a reference to the same `fs` object.
let getServers: typeof import('@/lib/servers').getServers
let getServer: typeof import('@/lib/servers').getServer
let saveServer: typeof import('@/lib/servers').saveServer
let deleteServer: typeof import('@/lib/servers').deleteServer

beforeEach(async () => {
  vi.spyOn(fs, 'existsSync').mockReturnValue(true)
  vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined as any)
  vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined)
  // readFileSync spy is set per-test

  // Dynamic import ensures the spies are active when the module initialises
  const mod = await import('@/lib/servers')
  getServers = mod.getServers
  getServer = mod.getServer
  saveServer = mod.saveServer
  deleteServer = mod.deleteServer
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

// ─── getServers ───────────────────────────────────────────────────────────
describe('getServers', () => {
  it('returns an empty array when file contains []', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('[]' as any)
    expect(getServers()).toEqual([])
  })

  it('returns parsed servers from file', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([mockServer]) as any)
    const result = getServers()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Test Server')
  })

  it('returns multiple servers', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify([mockServer, mockServer2]) as any,
    )
    expect(getServers()).toHaveLength(2)
  })
})

// ─── getServer ────────────────────────────────────────────────────────────
describe('getServer', () => {
  it('returns the matching server by id', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify([mockServer, mockServer2]) as any,
    )
    const result = getServer('server-1')
    expect(result?.name).toBe('Test Server')
  })

  it('returns undefined for an unknown id', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([mockServer]) as any)
    expect(getServer('does-not-exist')).toBeUndefined()
  })

  it('returns undefined when store is empty', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('[]' as any)
    expect(getServer('server-1')).toBeUndefined()
  })
})

// ─── saveServer ───────────────────────────────────────────────────────────
describe('saveServer', () => {
  it('appends a new server and writes to file', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('[]' as any)
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined)

    saveServer(mockServer)

    expect(writeSpy).toHaveBeenCalledOnce()
    const written = JSON.parse((writeSpy.mock.calls[0][1] as string))
    expect(written).toHaveLength(1)
    expect(written[0].id).toBe('server-1')
  })

  it('updates an existing server in place', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([mockServer]) as any)
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined)

    saveServer({ ...mockServer, name: 'Updated Name' })

    const written = JSON.parse((writeSpy.mock.calls[0][1] as string))
    expect(written).toHaveLength(1)
    expect(written[0].name).toBe('Updated Name')
  })

  it('does not duplicate — adds second server alongside first', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([mockServer]) as any)
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined)

    saveServer(mockServer2)

    const written = JSON.parse((writeSpy.mock.calls[0][1] as string))
    expect(written).toHaveLength(2)
  })
})

// ─── deleteServer ─────────────────────────────────────────────────────────
describe('deleteServer', () => {
  it('removes the server with the given id', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify([mockServer, mockServer2]) as any,
    )
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined)

    deleteServer('server-1')

    const written = JSON.parse((writeSpy.mock.calls[0][1] as string))
    expect(written).toHaveLength(1)
    expect(written[0].id).toBe('server-2')
  })

  it('is a no-op for an id that does not exist', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify([mockServer]) as any)
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockReturnValue(undefined)

    deleteServer('unknown-id')

    const written = JSON.parse((writeSpy.mock.calls[0][1] as string))
    expect(written).toHaveLength(1)
  })
})
