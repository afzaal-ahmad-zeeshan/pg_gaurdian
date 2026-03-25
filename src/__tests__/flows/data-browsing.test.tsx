/**
 * User Flow Tests — Data Browsing
 *
 * Covers end-to-end rendering flows for the three data pages:
 *   Flow 4: View Roles page — server selected, data loads and renders
 *   Flow 5: View Users page — connected-user panel + full users table
 *   Flow 6: View Databases page — database list renders
 *   Flow 7: Fetch is NOT triggered without a server
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { RolesPage } from '@/components/roles/RolesPage'
import { UsersPage } from '@/components/users/UsersPage'
import DatabasesPage from '@/app/databases/page'
import { Wrapper, WrapperWithServer, mockRoles, mockDatabases, mockCurrentUser } from '../helpers'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

// ─── Flow 4: View Roles ───────────────────────────────────────────────────
describe('Flow: View Roles', () => {
  it('automatically fetches and renders roles when a server is selected', async () => {
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

  it('shows table header columns', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve(mockRoles),
      } as Response),
    )

    render(<RolesPage />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument()
      expect(screen.getByText('Can Login')).toBeInTheDocument()
      expect(screen.getByText('Superuser')).toBeInTheDocument()
      expect(screen.getByText('Create DB')).toBeInTheDocument()
      expect(screen.getByText('Replication')).toBeInTheDocument()
      expect(screen.getByText('Member of')).toBeInTheDocument()
    })
  })
})

// ─── Flow 5: View Users ───────────────────────────────────────────────────
describe('Flow: View Users', () => {
  it('shows connected-user section and all-users table', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ users: mockRoles, currentUser: mockCurrentUser }),
      } as Response),
    )

    render(<UsersPage />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText(/connected as/i)).toBeInTheDocument()
      expect(screen.getByText('testuser')).toBeInTheDocument()
      expect(screen.getByText('admin')).toBeInTheDocument()
      expect(screen.getByText('readonly')).toBeInTheDocument()
    })
  })

  it('shows DB privilege rows for the connected user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ users: mockRoles, currentUser: mockCurrentUser }),
      } as Response),
    )

    render(<UsersPage />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText('postgres')).toBeInTheDocument()
      expect(screen.getByText('testdb')).toBeInTheDocument()
    })
  })

  it('shows "Member of" section with groups', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ users: mockRoles, currentUser: mockCurrentUser }),
      } as Response),
    )

    render(<UsersPage />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText('app_user')).toBeInTheDocument()
    })
  })

  it('shows Superuser attribute badge when current user is a superuser', async () => {
    const superCurrentUser = { ...mockCurrentUser, rolsuper: true }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ users: mockRoles, currentUser: superCurrentUser }),
      } as Response),
    )

    render(<UsersPage />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      // "Superuser" appears at least twice: once as a column header,
      // once as the attribute badge in the current-user section.
      const matches = screen.getAllByText('Superuser')
      expect(matches.length).toBeGreaterThanOrEqual(2)
    })
  })
})

// ─── Flow 6: View Databases ───────────────────────────────────────────────
describe('Flow: View Databases', () => {
  it('fetches and displays the database list', async () => {
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
})

// ─── Flow 7: Fetch not triggered without server ───────────────────────────
describe('Flow: No server selected', () => {
  it('does not call fetch on RolesPage when no server is configured', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    render(<RolesPage />, { wrapper: Wrapper })

    // Allow React Query a tick to potentially fire
    await new Promise((r) => setTimeout(r, 50))
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
