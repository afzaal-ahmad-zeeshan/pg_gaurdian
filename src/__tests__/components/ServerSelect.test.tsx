/**
 * Component Tests — ServerSelect
 *
 * Covers: hidden when ≤1 server, visible when ≥2 servers.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ServerSelect } from '@/components/ServerSelect'
import { Wrapper, WrapperWithServer, WrapperWithTwoServers } from '../helpers'

beforeEach(() => localStorage.clear())

describe('ServerSelect — hidden cases', () => {
  it('returns null when no servers are configured', () => {
    const { container } = render(<ServerSelect />, { wrapper: Wrapper })
    expect(container.firstChild).toBeNull()
  })

  it('returns null when exactly one server is configured', async () => {
    const { container } = render(<ServerSelect />, { wrapper: WrapperWithServer })
    await waitFor(() => {})
    expect(container.firstChild).toBeNull()
  })
})

describe('ServerSelect — with two servers', () => {
  it('renders a combobox trigger when two servers are present', async () => {
    render(<ServerSelect />, { wrapper: WrapperWithTwoServers })
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })
  })

  it('trigger contains the name of the auto-selected first server', async () => {
    render(<ServerSelect />, { wrapper: WrapperWithTwoServers })
    await waitFor(() => {
      const trigger = screen.getByRole('combobox')
      // After context auto-selects server-1, the trigger should render "Test Server"
      expect(trigger.textContent).toContain('Test Server')
    }, { timeout: 3000 })
  })
})
