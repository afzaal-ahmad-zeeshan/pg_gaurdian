/**
 * User Flow Tests — Server Management
 *
 * Covers end-to-end interactions a user performs to manage servers:
 *   Flow 1: Add a new server (open dialog → fill form → submit → server appears)
 *   Flow 2: Test an existing server connection
 *   Flow 3: Remove a server from the list
 *
 * Note: AddServerDialog Label elements lack htmlFor, so inputs are found
 * by placeholder text rather than label text.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ServersPage } from '@/components/servers/ServersPage'
import { Wrapper, WrapperWithServer } from '../helpers'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('Flow: Add a new server', () => {
  it('opens the dialog, fills the form, submits successfully, and shows the server card', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: true }),
      } as Response),
    )

    render(<ServersPage />, { wrapper: Wrapper })

    // Step 1 — click Add Server
    fireEvent.click(screen.getByRole('button', { name: /add server/i }))

    await waitFor(() => {
      expect(screen.getByText(/add postgresql server/i)).toBeInTheDocument()
    })

    // Step 2 — fill the Name field (required, no default)
    fireEvent.change(screen.getByPlaceholderText('Production DB'), {
      target: { value: 'Flow Test DB' },
    })

    // Step 3 — submit the form
    fireEvent.click(screen.getByRole('button', { name: /^add server$/i }))

    // Step 4 — server card should appear and dialog close
    await waitFor(() => {
      expect(screen.queryByText(/add postgresql server/i)).not.toBeInTheDocument()
      expect(screen.getByText('Flow Test DB')).toBeInTheDocument()
    })
  })

  it('keeps dialog open and shows error when connection fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: false, error: 'Connection refused' }),
      } as Response),
    )

    render(<ServersPage />, { wrapper: Wrapper })
    fireEvent.click(screen.getByRole('button', { name: /add server/i }))
    await waitFor(() => screen.getByText(/add postgresql server/i))

    fireEvent.change(screen.getByPlaceholderText('Production DB'), {
      target: { value: 'Bad Server' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^add server$/i }))

    await waitFor(() => {
      // Error shown inside dialog
      expect(screen.getByText(/connection refused/i)).toBeInTheDocument()
      // Dialog still open
      expect(screen.getByText(/add postgresql server/i)).toBeInTheDocument()
    })
  })
})

describe('Flow: Test existing server connection', () => {
  it('shows ✓ Connected badge after successful test', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: true }),
      } as Response),
    )

    render(<ServersPage />, { wrapper: WrapperWithServer })
    await waitFor(() => screen.getByRole('button', { name: /test connection/i }))

    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

    await waitFor(() => {
      expect(screen.getByText(/✓ Connected/)).toBeInTheDocument()
    })
  })

  it('shows error detail after a failed test', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: false, error: 'password authentication failed' }),
      } as Response),
    )

    render(<ServersPage />, { wrapper: WrapperWithServer })
    await waitFor(() => screen.getByRole('button', { name: /test connection/i }))

    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

    await waitFor(() => {
      expect(screen.getByText(/password authentication failed/i)).toBeInTheDocument()
    })
  })
})

describe('Flow: Remove a server', () => {
  it('removes server card and shows empty state after clicking remove', async () => {
    render(<ServersPage />, { wrapper: WrapperWithServer })
    await waitFor(() => screen.getByText('Test Server'))

    fireEvent.click(screen.getByTitle(/remove from browser/i))

    await waitFor(() => {
      expect(screen.queryByText('Test Server')).not.toBeInTheDocument()
      expect(screen.getByText(/no servers added yet/i)).toBeInTheDocument()
    })
  })
})
