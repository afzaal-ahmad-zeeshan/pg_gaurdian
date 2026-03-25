/**
 * Component Tests — DatabasesPage
 *
 * Covers: no server state, loading state, databases table.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import DatabasesPage from '@/app/databases/page'
import { Wrapper, WrapperWithServer, mockDatabases } from '../helpers'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('DatabasesPage — no server configured', () => {
  it('shows "No servers configured" message', () => {
    render(<DatabasesPage />, { wrapper: Wrapper })
    expect(screen.getByText(/no servers configured/i)).toBeInTheDocument()
  })
})

describe('DatabasesPage — loading state', () => {
  it('shows loading indicator while fetching', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    render(<DatabasesPage />, { wrapper: WrapperWithServer })
    await waitFor(() => {
      expect(screen.getByText(/loading…/i)).toBeInTheDocument()
    })
  })
})

describe('DatabasesPage — databases table', () => {
  it('renders a row for each database', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve(mockDatabases),
      } as Response),
    )

    render(<DatabasesPage />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText('postgres')).toBeInTheDocument()
      expect(screen.getByText('testdb')).toBeInTheDocument()
    })
  })

  it('shows database owner name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve(mockDatabases),
      } as Response),
    )

    render(<DatabasesPage />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText('pg_admin')).toBeInTheDocument()
    })
  })

  it('renders table headers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve(mockDatabases),
      } as Response),
    )

    render(<DatabasesPage />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText('OID')).toBeInTheDocument()
      expect(screen.getByText('Name')).toBeInTheDocument()
      expect(screen.getByText('Owner')).toBeInTheDocument()
    })
  })
})
