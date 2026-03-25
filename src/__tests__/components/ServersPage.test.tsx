/**
 * Component Tests — ServersPage
 *
 * Covers: empty state, server card rendering, test connection, remove server.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ServersPage } from '@/components/servers/ServersPage'
import { Wrapper, WrapperWithServer, mockServer } from '../helpers'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('ServersPage — empty state', () => {
  it('shows "No servers added" message', () => {
    render(<ServersPage />, { wrapper: Wrapper })
    expect(screen.getByText(/no servers added yet/i)).toBeInTheDocument()
  })

  it('renders the "Add Server" button', () => {
    render(<ServersPage />, { wrapper: Wrapper })
    expect(screen.getByRole('button', { name: /add server/i })).toBeInTheDocument()
  })
})

describe('ServersPage — with a server', () => {
  it('displays the server name and connection string', async () => {
    render(<ServersPage />, { wrapper: WrapperWithServer })
    await waitFor(() => {
      expect(screen.getByText('Test Server')).toBeInTheDocument()
      expect(screen.getByText(/testuser@localhost:5432/i)).toBeInTheDocument()
    })
  })

  it('renders a "Test connection" button for the server', async () => {
    render(<ServersPage />, { wrapper: WrapperWithServer })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /test connection/i })).toBeInTheDocument()
    })
  })

  it('shows ✓ Connected after a successful connection test', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ json: () => Promise.resolve({ ok: true }) } as Response),
    )

    render(<ServersPage />, { wrapper: WrapperWithServer })
    await waitFor(() => screen.getByRole('button', { name: /test connection/i }))

    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

    await waitFor(() => {
      expect(screen.getByText(/✓ Connected/i)).toBeInTheDocument()
    })
  })

  it('shows error message after a failed connection test', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: false, error: 'ECONNREFUSED' }),
      } as Response),
    )

    render(<ServersPage />, { wrapper: WrapperWithServer })
    await waitFor(() => screen.getByRole('button', { name: /test connection/i }))

    fireEvent.click(screen.getByRole('button', { name: /test connection/i }))

    await waitFor(() => {
      expect(screen.getByText(/ECONNREFUSED/i)).toBeInTheDocument()
    })
  })
})

describe('ServersPage — remove server', () => {
  it('removes the server card when the trash button is clicked', async () => {
    render(<ServersPage />, { wrapper: WrapperWithServer })
    await waitFor(() => screen.getByText('Test Server'))

    // find the remove (trash) button
    const removeBtn = screen.getByTitle(/remove from browser/i)
    fireEvent.click(removeBtn)

    await waitFor(() => {
      expect(screen.queryByText('Test Server')).not.toBeInTheDocument()
      expect(screen.getByText(/no servers added yet/i)).toBeInTheDocument()
    })
  })
})

describe('ServersPage — Add Server dialog', () => {
  it('opens AddServerDialog when "Add Server" is clicked', async () => {
    render(<ServersPage />, { wrapper: Wrapper })
    fireEvent.click(screen.getByRole('button', { name: /add server/i }))
    await waitFor(() => {
      expect(screen.getByText(/add postgresql server/i)).toBeInTheDocument()
    })
  })
})
