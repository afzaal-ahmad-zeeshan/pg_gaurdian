'use client'
import { useQuery } from '@tanstack/react-query'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useServerContext } from '@/context/ServerContext'
import { ServerSelect } from '@/components/ServerSelect'

export default function DatabasesPage() {
  const { servers, selectedId, selected } = useServerContext()

  const { data: dbs = [], isLoading } = useQuery({
    queryKey: ['databases', selectedId],
    queryFn: () =>
      fetch('/api/pg/databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: selected }),
      }).then((r) => r.json()),
    enabled: !!selected,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Databases</h1>
          <p className="text-sm text-muted-foreground">Databases on the selected server</p>
        </div>
        <ServerSelect />
      </div>

      {servers.length === 0 && (
        <p className="text-muted-foreground text-sm">No servers configured. Add one on the Servers page.</p>
      )}
      {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}

      {Array.isArray(dbs) && dbs.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24 text-muted-foreground">OID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Owner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dbs.map((db: { oid: number; datname: string; owner: string }) => (
              <TableRow key={db.datname}>
                <TableCell className="font-mono text-xs text-muted-foreground">{db.oid}</TableCell>
                <TableCell className="font-mono">{db.datname}</TableCell>
                <TableCell className="font-mono text-sm">{db.owner}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
