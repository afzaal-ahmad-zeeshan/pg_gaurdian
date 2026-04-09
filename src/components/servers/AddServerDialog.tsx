'use client'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useServerContext } from '@/context/ServerContext'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

const blank = { name: '', host: 'localhost', port: '5432', database: 'postgres', user: 'postgres', password: '', ssl: false }

export function AddServerDialog({ open, onOpenChange }: Props) {
  const { addServer } = useServerContext()
  const [form, setForm] = useState(blank)
  const [persist, setPersist] = useState(true)

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch('/api/pg/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection: { ...data, port: Number(data.port) },
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Connection failed')
      return json
    },
    onSuccess: () => {
      const server = { id: crypto.randomUUID(), ...form, port: Number(form.port) }
      addServer(server, persist)
      onOpenChange(false)
      setForm(blank)
    },
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add PostgreSQL Server</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(form) }} className="space-y-4">
          {([
            { label: 'Name', key: 'name', placeholder: 'Production DB', type: 'text' },
            { label: 'Host', key: 'host', placeholder: 'localhost', type: 'text' },
            { label: 'Port', key: 'port', placeholder: '5432', type: 'text' },
            { label: 'Database', key: 'database', placeholder: 'postgres', type: 'text' },
            { label: 'User', key: 'user', placeholder: 'postgres', type: 'text' },
            { label: 'Password', key: 'password', placeholder: '', type: 'password' },
          ] as { label: string; key: keyof typeof form; placeholder: string; type: string }[]).map(({ label, key, placeholder, type }) => (
            <div key={key} className="space-y-1">
              <Label>{label}</Label>
              <Input
                type={type ?? 'text'}
                value={form[key] as string}
                onChange={set(key)}
                placeholder={placeholder}
                required={key !== 'password'}
              />
            </div>
          ))}

          <div className="rounded-md border border-border bg-muted/40 p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.ssl}
                onChange={(e) => setForm((f) => ({ ...f, ssl: e.target.checked }))}
                className="h-4 w-4 rounded accent-primary"
              />
              <span className="text-sm font-medium">Require SSL</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={persist}
                onChange={(e) => setPersist(e.target.checked)}
                className="h-4 w-4 rounded accent-primary"
              />
              <span className="text-sm font-medium">Remember in this browser</span>
            </label>
            <p className="text-xs text-muted-foreground pl-6">
              Saves the connection (including password) to localStorage. Uncheck for session-only.
            </p>
          </div>

          {mutation.error && (
            <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Connecting…' : 'Add Server'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
