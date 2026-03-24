'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { ThemeProvider } from '@/components/ThemeProvider'
import { ServerProvider } from '@/context/ServerContext'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ServerProvider>
          {children}
        </ServerProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
