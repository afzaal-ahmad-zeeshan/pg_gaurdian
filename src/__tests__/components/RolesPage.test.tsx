/**
 * Component Tests — RolesPage
 *
 * Covers: no server state, loading state, roles table, error state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { RolesPage } from '@/components/roles/RolesPage'
import { Wrapper, WrapperWithServer, mockRoles } from '../helpers'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('RolesPage — no server configured', () => {
  it('shows "No servers configured" message', () => {
    render(<RolesPage />, { wrapper: Wrapper })
    expect(screen.getByText(/no servers configured/i)).toBeInTheDocument()
  })
})

describe('RolesPage — loading state', () => {
  it('shows loading indicator while fetching', async () => {
    // fetch never resolves
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    render(<RolesPage />, { wrapper: WrapperWithServer })
    await waitFor(() => {
      expect(screen.getByText(/loading roles/i)).toBeInTheDocument()
    })
  })
})

describe('RolesPage — roles table', () => {
  it('renders a row for each role', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve(mockRoles),
      } as Response),
    )

    render(<RolesPage />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
      expect(screen.getByText('readonly')).toBeInTheDocument()
    })
  })

  it('shows superuser badge for superuser role', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve(mockRoles),
      } as Response),
    )

    render(<RolesPage />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
    })

    // admin row — superuser column should show "Yes"
    const cells = screen.getAllByText('Yes')
    expect(cells.length).toBeGreaterThan(0)
  })

  it('shows memberof badge for roles with group membership', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve(mockRoles),
      } as Response),
    )

    render(<RolesPage />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText('pg_read_all_data')).toBeInTheDocument()
    })
  })
})

describe('RolesPage — error state', () => {
  it('shows error message when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Network error')))
    render(<RolesPage />, { wrapper: WrapperWithServer })
    await waitFor(() => {
      expect(screen.getByText(/failed to load roles/i)).toBeInTheDocument()
    })
  })
})
