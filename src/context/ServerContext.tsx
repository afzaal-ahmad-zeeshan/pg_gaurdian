'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { ServerConnection } from '@/types'
import { useServers } from '@/hooks/useServers'

interface ServerContextValue {
  servers: ServerConnection[]
  selectedId: string
  setSelectedId: (id: string) => void
  selected: ServerConnection | undefined
  addServer: (server: ServerConnection, persist: boolean) => void
  removeServer: (id: string) => void
}

const ServerContext = createContext<ServerContextValue | null>(null)

export function ServerProvider({ children }: { children: ReactNode }) {
  const { servers, addServer, removeServer } = useServers()
  const [selectedId, setSelectedId] = useState('')

  // Auto-select: always default to first server
  useEffect(() => {
    if (servers.length > 0 && (!selectedId || !servers.find((s) => s.id === selectedId))) {
      setSelectedId(servers[0].id)
    }
    if (servers.length === 0) setSelectedId('')
  }, [servers, selectedId])

  const selected = servers.find((s) => s.id === selectedId)

  return (
    <ServerContext.Provider value={{ servers, selectedId, setSelectedId, selected, addServer, removeServer }}>
      {children}
    </ServerContext.Provider>
  )
}

export function useServerContext() {
  const ctx = useContext(ServerContext)
  if (!ctx) throw new Error('useServerContext must be used within ServerProvider')
  return ctx
}
