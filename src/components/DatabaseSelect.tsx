'use client'
import { useQuery } from '@tanstack/react-query'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { PgDatabase, ServerConnection } from '@/types'

/**
 * Fetches the list of databases on `connection` and renders a Select dropdown.
 * Highlights the server's default database with a "(default)" label.
 * Calls `onChange` with the selected database name.
 */
export function DatabaseSelect({
  connection,
  value,
  onChange,
  placeholder = 'Select database…',
  className,
}: {
  connection: ServerConnection
  value: string
  onChange: (db: string) => void
  placeholder?: string
  className?: string
}) {
  const { data: databases = [], isLoading } = useQuery<PgDatabase[]>({
    queryKey: ['databases', connection.id],
    queryFn: () =>
      fetch('/api/pg/databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection }),
      }).then((r) => r.json()),
    staleTime: 60_000,
  })

  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className={`font-mono ${className ?? ''}`}>
        <SelectValue placeholder={isLoading ? 'Loading…' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {databases.map((db) => (
          <SelectItem key={db.oid} value={db.datname}>
            <span className="font-mono">{db.datname}</span>
            {db.datname === connection.database && (
              <span className="ml-2 text-xs text-muted-foreground">(default)</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
