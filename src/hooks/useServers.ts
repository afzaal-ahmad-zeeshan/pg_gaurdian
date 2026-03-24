'use client'
import { useState, useEffect, useCallback } from 'react'
import { ServerConnection } from '@/types'

const LS_KEY = 'pg_guardian_servers'

function loadFromStorage(): ServerConnection[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function useServers() {
  const [servers, setServers] = useState<ServerConnection[]>([])

  useEffect(() => {
    setServers(loadFromStorage())
  }, [])

  const addServer = useCallback((server: ServerConnection, persist: boolean) => {
    setServers((prev) => {
      const next = [...prev.filter((s) => s.id !== server.id), server]
      if (persist) localStorage.setItem(LS_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const removeServer = useCallback((id: string) => {
    setServers((prev) => {
      const next = prev.filter((s) => s.id !== id)
      localStorage.setItem(LS_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return { servers, addServer, removeServer }
}
