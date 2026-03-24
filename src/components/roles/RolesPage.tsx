'use client'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PgRole } from '@/types'
import { useServerContext } from '@/context/ServerContext'
import { ServerSelect } from '@/components/ServerSelect'

export function RolesPage() {
  const { servers, selectedId, selected } = useServerContext()

  const { data: roles = [], isLoading, error } = useQuery({
    queryKey: ['roles', selectedId],
    queryFn: () =>
      fetch('/api/pg/roles', {
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
          <h1 className="text-2xl font-semibold">Roles</h1>
          <p className="text-sm text-muted-foreground">View and manage PostgreSQL roles</p>
        </div>
        <ServerSelect />
      </div>

      {servers.length === 0 && (
        <p className="text-muted-foreground text-sm">No servers configured. Add one on the Servers page.</p>
      )}
      {isLoading && <p className="text-muted-foreground text-sm">Loading roles…</p>}
      {error && <p className="text-destructive text-sm">Failed to load roles.</p>}

      {Array.isArray(roles) && roles.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Can Login</TableHead>
              <TableHead>Superuser</TableHead>
              <TableHead>Create DB</TableHead>
              <TableHead>Replication</TableHead>
              <TableHead>Member of</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role: PgRole) => (
              <TableRow key={role.rolname}>
                <TableCell className="font-mono text-sm">{role.rolname}</TableCell>
                <TableCell><Flag on={role.rolcanlogin} /></TableCell>
                <TableCell><Flag on={role.rolsuper} /></TableCell>
                <TableCell><Flag on={role.rolcreatedb} /></TableCell>
                <TableCell><Flag on={role.rolreplication} /></TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(Array.isArray(role.memberof) ? role.memberof : []).map((r) => (
                      <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function Flag({ on }: { on: boolean }) {
  return <Badge variant={on ? 'default' : 'outline'}>{on ? 'Yes' : 'No'}</Badge>
}
