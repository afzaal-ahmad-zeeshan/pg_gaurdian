'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { ServerConnection } from '@/types'
import { useServers } from '@/hooks/useServers'

const SELECTED_KEY = 'pg_guardian_selected_server'

function loadSelectedId(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(SELECTED_KEY) ?? ''
}

function saveSelectedId(id: string) {
  if (typeof window === 'undefined') return
  if (id) localStorage.setItem(SELECTED_KEY, id)
  else localStorage.removeItem(SELECTED_KEY)
}

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
  const [selectedId, setSelectedIdState] = useState('')

  // Restore persisted selection once on mount (after localStorage is available)
  useEffect(() => {
    setSelectedIdState(loadSelectedId())
  }, [])

  // Auto-select: fall back to first server when selection is missing or invalid
  useEffect(() => {
    if (servers.length > 0 && !servers.find((s) => s.id === selectedId)) {
      const id = servers[0].id
      setSelectedIdState(id)
      saveSelectedId(id)
    }
    if (servers.length === 0) {
      setSelectedIdState('')
      saveSelectedId('')
    }
  }, [servers, selectedId])

  const setSelectedId = (id: string) => {
    setSelectedIdState(id)
    saveSelectedId(id)
  }

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
