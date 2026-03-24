'use client'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AddServerDialog } from './AddServerDialog'
import { Plus, Plug, Trash2 } from 'lucide-react'
import { useServerContext } from '@/context/ServerContext'
import { ServerConnection } from '@/types'

export function ServersPage() {
  const { servers, removeServer } = useServerContext()
  const [open, setOpen] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; error?: string }>>({})

  const testMutation = useMutation({
    mutationFn: async (server: ServerConnection) => {
      const res = await fetch('/api/pg/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: server }),
      })
      return res.json() as Promise<{ ok: boolean; error?: string }>
    },
    onSuccess: (data, server) => {
      setTestResults((prev) => ({ ...prev, [server.id]: data }))
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Servers</h1>
          <p className="text-sm text-muted-foreground">Manage your PostgreSQL connections</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} className="mr-2" /> Add Server
        </Button>
      </div>

      {servers.length === 0 && (
        <p className="text-muted-foreground text-sm">No servers added yet. Click "Add Server" to get started.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {servers.map((server) => {
          const result = testResults[server.id]
          return (
            <Card key={server.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{server.name}</CardTitle>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline">{server.database}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeServer(server.id)}
                      title="Remove from browser"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground font-mono">
                  {server.user}@{server.host}:{server.port}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testMutation.mutate(server)}
                  disabled={testMutation.isPending}
                >
                  <Plug size={14} className="mr-1" />
                  {testMutation.isPending ? 'Testing…' : 'Test connection'}
                </Button>
                {result && (
                  <p className={`text-xs ${result.ok ? 'text-green-500' : 'text-destructive'}`}>
                    {result.ok ? '✓ Connected' : `✗ ${result.error}`}
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <AddServerDialog open={open} onOpenChange={setOpen} />
    </div>
  )
}
