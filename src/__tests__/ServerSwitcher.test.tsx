import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ServerSwitcher } from '@/components/ServerSwitcher'
import { ServerProvider } from '@/context/ServerContext'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient()
  return (
    <QueryClientProvider client={qc}>
      <ServerProvider>{children}</ServerProvider>
    </QueryClientProvider>
  )
}

describe('ServerSwitcher', () => {
  it('shows "No servers added" when the list is empty', () => {
    render(<ServerSwitcher />, { wrapper })
    expect(screen.getByText('No servers added')).toBeInTheDocument()
  })
})
