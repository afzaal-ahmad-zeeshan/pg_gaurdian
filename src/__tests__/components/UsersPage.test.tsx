/**
 * Component Tests — UsersPage
 *
 * Covers: no server state, current user panel, all-users table,
 *         "you" badge on the connected user's row, DB privileges table.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { UsersPage } from '@/components/users/UsersPage'
import { Wrapper, WrapperWithServer, mockRoles, mockCurrentUser } from '../helpers'

const usersResponse = { users: mockRoles, currentUser: mockCurrentUser }

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('UsersPage — no server configured', () => {
  it('shows "No servers configured" message', () => {
    render(<UsersPage />, { wrapper: Wrapper })
    expect(screen.getByText(/no servers configured/i)).toBeInTheDocument()
  })
})

describe('UsersPage — current user panel', () => {
  it('shows "Connected as" with the username', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ json: () => Promise.resolve(usersResponse) } as Response),
    )

    render(<UsersPage />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText(/connected as/i)).toBeInTheDocument()
      expect(screen.getByText('testuser')).toBeInTheDocument()
    })
  })

  it('shows member-of group badge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ json: () => Promise.resolve(usersResponse) } as Response),
    )

    render(<UsersPage />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText('app_user')).toBeInTheDocument()
    })
  })

  it('renders the database privileges table', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ json: () => Promise.resolve(usersResponse) } as Response),
    )

    render(<UsersPage />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText('Database privileges:')).toBeInTheDocument()
      expect(screen.getByText('testdb')).toBeInTheDocument()
    })
  })
})

describe('UsersPage — all users table', () => {
  it('renders a row for each user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ json: () => Promise.resolve(usersResponse) } as Response),
    )

    render(<UsersPage />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText('admin')).toBeInTheDocument()
      expect(screen.getByText('readonly')).toBeInTheDocument()
    })
  })

  it('highlights the connected user row with a "you" badge', async () => {
    // currentUser.username = 'testuser', but mockRoles uses 'admin'/'readonly'
    // We need a user in the list that matches the currentUser username
    const currentAsUser = {
      ...mockCurrentUser,
      username: 'admin',
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ users: mockRoles, currentUser: currentAsUser }),
      } as Response),
    )

    render(<UsersPage />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText('you')).toBeInTheDocument()
    })
  })
})

describe('UsersPage — error state', () => {
  it('shows error when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('fail')))
    render(<UsersPage />, { wrapper: WrapperWithServer })
    await waitFor(() => {
      expect(screen.getByText(/failed to load users/i)).toBeInTheDocument()
    })
  })
})
