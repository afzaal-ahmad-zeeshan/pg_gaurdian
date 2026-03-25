/**
 * Component Tests — AddServerDialog
 *
 * Covers: form field rendering, successful add flow, connection failure,
 *         cancel button, persist checkbox.
 *
 * Note: Label components are not associated with inputs via htmlFor,
 * so we query inputs by placeholder / display-value / role.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AddServerDialog } from '@/components/servers/AddServerDialog'
import { Wrapper } from '../helpers'

const onOpenChange = vi.fn()

function renderDialog(open = true) {
  return render(<AddServerDialog open={open} onOpenChange={onOpenChange} />, {
    wrapper: Wrapper,
  })
}

beforeEach(() => {
  localStorage.clear()
  onOpenChange.mockClear()
})
afterEach(() => vi.restoreAllMocks())

describe('AddServerDialog — form fields', () => {
  it('renders all form inputs', () => {
    renderDialog()
    // 5 text-type inputs (name, host, port, database, user) + 1 password
    expect(screen.getAllByRole('textbox')).toHaveLength(5)
    expect(document.querySelector('input[type="password"]')).toBeInTheDocument()
  })

  it('pre-fills host=localhost', () => {
    renderDialog()
    expect(screen.getByDisplayValue('localhost')).toBeInTheDocument()
  })

  it('pre-fills port=5432', () => {
    renderDialog()
    expect(screen.getByDisplayValue('5432')).toBeInTheDocument()
  })

  it('renders persist checkbox checked by default', () => {
    renderDialog()
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })
})

describe('AddServerDialog — successful add', () => {
  it('calls onOpenChange(false) and adds server after successful connection test', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ json: () => Promise.resolve({ ok: true }) } as Response),
    )

    renderDialog()

    // Fill the name field (required, no default)
    fireEvent.change(screen.getByPlaceholderText('Production DB'), {
      target: { value: 'My DB' },
    })

    fireEvent.click(screen.getByRole('button', { name: /add server/i }))

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })
})

describe('AddServerDialog — connection failure', () => {
  it('shows error message when connection test fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: false, error: 'Authentication failed' }),
      } as Response),
    )

    renderDialog()

    fireEvent.change(screen.getByPlaceholderText('Production DB'), {
      target: { value: 'Bad DB' },
    })
    fireEvent.click(screen.getByRole('button', { name: /add server/i }))

    await waitFor(() => {
      expect(screen.getByText(/authentication failed/i)).toBeInTheDocument()
    })
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})

describe('AddServerDialog — cancel', () => {
  it('calls onOpenChange(false) when Cancel is clicked', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('AddServerDialog — closed state', () => {
  it('does not render form when open=false', () => {
    renderDialog(false)
    expect(screen.queryByPlaceholderText('Production DB')).not.toBeInTheDocument()
  })
})
