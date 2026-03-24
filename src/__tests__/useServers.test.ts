import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useServers } from '@/hooks/useServers'

const mockServer = {
  id: 'test-id-1',
  name: 'Local Dev',
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'secret',
}

beforeEach(() => {
  localStorage.clear()
})

describe('useServers', () => {
  it('starts with an empty list', () => {
    const { result } = renderHook(() => useServers())
    expect(result.current.servers).toEqual([])
  })

  it('adds a server and persists it when persist=true', () => {
    const { result } = renderHook(() => useServers())

    act(() => {
      result.current.addServer(mockServer, true)
    })

    expect(result.current.servers).toHaveLength(1)
    expect(result.current.servers[0].name).toBe('Local Dev')
    expect(JSON.parse(localStorage.getItem('pg_guardian_servers') ?? '[]')).toHaveLength(1)
  })

  it('adds a server without persisting when persist=false', () => {
    const { result } = renderHook(() => useServers())

    act(() => {
      result.current.addServer(mockServer, false)
    })

    expect(result.current.servers).toHaveLength(1)
    expect(localStorage.getItem('pg_guardian_servers')).toBeNull()
  })

  it('removes a server and updates localStorage', () => {
    const { result } = renderHook(() => useServers())

    act(() => {
      result.current.addServer(mockServer, true)
    })
    act(() => {
      result.current.removeServer(mockServer.id)
    })

    expect(result.current.servers).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('pg_guardian_servers') ?? '[]')).toHaveLength(0)
  })
})
