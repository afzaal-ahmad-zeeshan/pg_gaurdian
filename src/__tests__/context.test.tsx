/**
 * ServerContext Tests — src/context/ServerContext.tsx
 *
 * Covers: auto-selection, manual selection, addServer, removeServer,
 *         clearing selection when last server is removed.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { ServerProvider, useServerContext } from '@/context/ServerContext'
import { mockServer, mockServer2 } from './helpers'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode } from 'react'

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <ServerProvider>{children}</ServerProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
})

describe('ServerContext — initial state', () => {
  it('starts with an empty servers list and no selection', () => {
    const { result } = renderHook(() => useServerContext(), { wrapper })
    expect(result.current.servers).toEqual([])
    expect(result.current.selectedId).toBe('')
    expect(result.current.selected).toBeUndefined()
  })
})

describe('ServerContext — auto-selection', () => {
  it('auto-selects the first server after addServer', async () => {
    const { result } = renderHook(() => useServerContext(), { wrapper })

    act(() => result.current.addServer(mockServer, false))

    await waitFor(() => {
      expect(result.current.selectedId).toBe('server-1')
      expect(result.current.selected?.name).toBe('Test Server')
    })
  })

  it('keeps selection when a second server is added', async () => {
    const { result } = renderHook(() => useServerContext(), { wrapper })

    act(() => result.current.addServer(mockServer, false))
    await waitFor(() => expect(result.current.selectedId).toBe('server-1'))

    act(() => result.current.addServer(mockServer2, false))
    await waitFor(() => expect(result.current.selectedId).toBe('server-1'))
  })

  it('auto-selects from localStorage on mount', async () => {
    localStorage.setItem('pg_guardian_servers', JSON.stringify([mockServer]))
    const { result } = renderHook(() => useServerContext(), { wrapper })

    await waitFor(() => {
      expect(result.current.servers).toHaveLength(1)
      expect(result.current.selectedId).toBe('server-1')
    })
  })
})

describe('ServerContext — manual selection', () => {
  it('updates selected when setSelectedId is called', async () => {
    const { result } = renderHook(() => useServerContext(), { wrapper })

    act(() => {
      result.current.addServer(mockServer, false)
      result.current.addServer(mockServer2, false)
    })
    await waitFor(() => expect(result.current.servers).toHaveLength(2))

    act(() => result.current.setSelectedId('server-2'))
    expect(result.current.selectedId).toBe('server-2')
    expect(result.current.selected?.name).toBe('Staging')
  })
})

describe('ServerContext — removeServer', () => {
  it('removes the server and clears selection when it was the only one', async () => {
    const { result } = renderHook(() => useServerContext(), { wrapper })

    act(() => result.current.addServer(mockServer, false))
    await waitFor(() => expect(result.current.selectedId).toBe('server-1'))

    act(() => result.current.removeServer('server-1'))
    await waitFor(() => {
      expect(result.current.servers).toHaveLength(0)
      expect(result.current.selectedId).toBe('')
    })
  })

  it('falls back to the first remaining server after removing the selected one', async () => {
    const { result } = renderHook(() => useServerContext(), { wrapper })

    act(() => {
      result.current.addServer(mockServer, false)
      result.current.addServer(mockServer2, false)
    })
    await waitFor(() => expect(result.current.servers).toHaveLength(2))

    act(() => result.current.setSelectedId('server-2'))
    act(() => result.current.removeServer('server-2'))

    await waitFor(() => {
      expect(result.current.servers).toHaveLength(1)
      expect(result.current.selectedId).toBe('server-1')
    })
  })
})

describe('ServerContext — addServer persistence', () => {
  it('persists to localStorage when persist=true', async () => {
    const { result } = renderHook(() => useServerContext(), { wrapper })
    act(() => result.current.addServer(mockServer, true))

    const stored = JSON.parse(localStorage.getItem('pg_guardian_servers') ?? '[]')
    expect(stored).toHaveLength(1)
  })

  it('does not write to localStorage when persist=false', async () => {
    const { result } = renderHook(() => useServerContext(), { wrapper })
    act(() => result.current.addServer(mockServer, false))

    expect(localStorage.getItem('pg_guardian_servers')).toBeNull()
  })
})

describe('useServerContext — throws outside provider', () => {
  it('throws when used without ServerProvider', () => {
    expect(() => {
      renderHook(() => useServerContext())
    }).toThrow('useServerContext must be used within ServerProvider')
  })
})
