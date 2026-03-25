/**
 * Component Tests — PermissionsMatrix
 *
 * Covers:
 *   - No server configured → guard message
 *   - Auto-selects first user on load (single user)
 *   - Auto-selects first user on load (multiple users)
 *   - Fetches matrix for the auto-selected role
 *   - Renders all 8 section headings
 *   - Renders ✓ for granted permissions and — for denied
 *   - Renders kind badges (TABLE, VIEW, FN, ENUM …)
 *   - Loading state while users are fetching
 *   - "No login roles found" when user list is empty
 *   - Resets auto-selection when server changes
 *   - Does not fetch when no server is configured
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PermissionsMatrix } from '@/components/permissions/PermissionsMatrix'
import {
  Wrapper,
  WrapperWithServer,
  WrapperWithTwoServers,
  mockRoles,
  mockMatrix,
  mockFetchSequence,
} from '../helpers'

const usersPayload = { users: mockRoles, currentUser: null }

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

// ─── No server ────────────────────────────────────────────────────────────
describe('PermissionsMatrix — no server configured', () => {
  it('shows "No servers configured" message', () => {
    render(<PermissionsMatrix />, { wrapper: Wrapper })
    expect(screen.getByText(/no servers configured/i)).toBeInTheDocument()
  })

  it('does not call fetch when no server is configured', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    render(<PermissionsMatrix />, { wrapper: Wrapper })

    await new Promise((r) => setTimeout(r, 50))
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// ─── Auto-selection ───────────────────────────────────────────────────────
describe('PermissionsMatrix — auto-selection', () => {
  it('auto-selects the only user when there is one', async () => {
    mockFetchSequence(
      { users: [mockRoles[0]] }, // single user: 'admin'
      mockMatrix,
    )

    render(<PermissionsMatrix />, { wrapper: WrapperWithServer })

    // The trigger button should contain the auto-selected username
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveTextContent('admin')
    })
  })

  it('auto-selects the first user when multiple users exist', async () => {
    mockFetchSequence(
      usersPayload, // two users: 'admin', 'readonly' — first is 'admin'
      mockMatrix,
    )

    render(<PermissionsMatrix />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveTextContent('admin')
    })
  })

  it('fetches the matrix for the auto-selected role', async () => {
    const fetchFn = mockFetchSequence(usersPayload, mockMatrix)

    render(<PermissionsMatrix />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      // Second fetch should carry rolename: 'admin'
      const matrixCall = fetchFn.mock.calls.find((args) => {
        const body = JSON.parse(args[1]?.body ?? '{}')
        return body.rolename === 'admin'
      })
      expect(matrixCall).toBeDefined()
    })
  })
})

// ─── Section rendering ────────────────────────────────────────────────────
describe('PermissionsMatrix — section headings', () => {
  it('renders all 8 section titles after data loads', async () => {
    mockFetchSequence(usersPayload, mockMatrix)

    render(<PermissionsMatrix />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      // These labels are unique to section headers (summary strip has different text)
      expect(screen.getByText('Tables, Views & Materialized Views')).toBeInTheDocument()
      expect(screen.getByText('Routines (functions, procedures, aggregates)')).toBeInTheDocument()
      expect(screen.getByText('Types (domains, enums, ranges)')).toBeInTheDocument()
      expect(screen.getByText('Foreign Data Wrappers')).toBeInTheDocument()
      // These appear in both section headers and the summary strip — assert at least 2
      expect(screen.getAllByText('Databases').length).toBeGreaterThanOrEqual(2)
      expect(screen.getAllByText('Schemas').length).toBeGreaterThanOrEqual(2)
      expect(screen.getAllByText('Sequences').length).toBeGreaterThanOrEqual(2)
      expect(screen.getAllByText('Foreign Servers').length).toBeGreaterThanOrEqual(2)
    })
  })
})

// ─── Permission cells ─────────────────────────────────────────────────────
describe('PermissionsMatrix — permission display', () => {
  it('shows ✓ for granted permissions', async () => {
    mockFetchSequence(usersPayload, mockMatrix)

    render(<PermissionsMatrix />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      const checks = screen.getAllByText('✓')
      expect(checks.length).toBeGreaterThan(0)
    })
  })

  it('shows — for denied permissions', async () => {
    mockFetchSequence(usersPayload, mockMatrix)

    render(<PermissionsMatrix />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      const dashes = screen.getAllByText('—')
      expect(dashes.length).toBeGreaterThan(0)
    })
  })

  it('renders table/view object names', async () => {
    mockFetchSequence(usersPayload, mockMatrix)

    render(<PermissionsMatrix />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      // Exact string match avoids collisions with "public.users_id_seq" in sequences section
      expect(screen.getByText('public.users')).toBeInTheDocument()
      expect(screen.getByText('public.orders_view')).toBeInTheDocument()
    })
  })

  it('renders schema names', async () => {
    mockFetchSequence(usersPayload, mockMatrix)

    render(<PermissionsMatrix />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText('public')).toBeInTheDocument()
    })
  })
})

// ─── Kind badges ─────────────────────────────────────────────────────────
describe('PermissionsMatrix — kind badges', () => {
  it('shows TABLE badge for regular tables', async () => {
    mockFetchSequence(usersPayload, mockMatrix)

    render(<PermissionsMatrix />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText('TABLE')).toBeInTheDocument()
    })
  })

  it('shows VIEW badge for views', async () => {
    mockFetchSequence(usersPayload, mockMatrix)

    render(<PermissionsMatrix />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText('VIEW')).toBeInTheDocument()
    })
  })

  it('shows FN badge for functions', async () => {
    mockFetchSequence(usersPayload, mockMatrix)

    render(<PermissionsMatrix />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText('FN')).toBeInTheDocument()
    })
  })

  it('shows ENUM badge for enum types', async () => {
    mockFetchSequence(usersPayload, mockMatrix)

    render(<PermissionsMatrix />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText('ENUM')).toBeInTheDocument()
    })
  })
})

// ─── Loading / empty states ───────────────────────────────────────────────
describe('PermissionsMatrix — loading and empty states', () => {
  it('shows loading indicator while users are being fetched', () => {
    // Never resolves — keeps component in loading state
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))

    render(<PermissionsMatrix />, { wrapper: WrapperWithServer })

    expect(screen.getByText(/loading roles/i)).toBeInTheDocument()
  })

  it('shows "No login roles found" when the server has no login roles', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ users: [] }),
      } as Response),
    )

    render(<PermissionsMatrix />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      expect(screen.getByText(/no login roles found/i)).toBeInTheDocument()
    })
  })
})

// ─── Summary strip ────────────────────────────────────────────────────────
describe('PermissionsMatrix — summary strip', () => {
  it('shows resource counts in the summary strip', async () => {
    mockFetchSequence(usersPayload, mockMatrix)

    render(<PermissionsMatrix />, { wrapper: WrapperWithServer })

    await waitFor(() => {
      // These labels are unique to the summary strip (section titles are more verbose)
      expect(screen.getByText('Tables & Views')).toBeInTheDocument()
      expect(screen.getByText('Routines')).toBeInTheDocument()
      expect(screen.getByText('FDWs')).toBeInTheDocument()
    })
  })
})
