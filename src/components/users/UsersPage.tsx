'use client'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PgRole, PgCurrentUser } from '@/types'
import { useServerContext } from '@/context/ServerContext'
import { ServerSelect } from '@/components/ServerSelect'

export function UsersPage() {
  const { servers, selectedId, selected } = useServerContext()

  const { data, isLoading, error } = useQuery<{ users: PgRole[]; currentUser: PgCurrentUser }>({
    queryKey: ['users', selectedId],
    queryFn: () =>
      fetch('/api/pg/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection: selected }),
      }).then((r) => r.json()),
    enabled: !!selected,
  })

  const users = data?.users ?? []
  const currentUser = data?.currentUser

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">PostgreSQL login roles on the selected server</p>
        </div>
        <ServerSelect />
      </div>

      {servers.length === 0 && (
        <p className="text-muted-foreground text-sm">No servers configured. Add one on the Servers page.</p>
      )}
      {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {error && <p className="text-destructive text-sm">Failed to load users.</p>}

      {currentUser && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">
            Connected as{' '}
            <span className="font-mono text-primary">{currentUser.username}</span>
            {currentUser.username !== currentUser.sessionUser && (
              <span className="text-muted-foreground text-sm font-normal ml-2">
                (session: {currentUser.sessionUser})
              </span>
            )}
          </h2>

          <div className="flex flex-wrap gap-2">
            <AttrBadge label="Superuser" on={currentUser.rolsuper} />
            <AttrBadge label="Create DB" on={currentUser.rolcreatedb} />
            <AttrBadge label="Create Role" on={currentUser.rolcreaterole} />
            <AttrBadge label="Replication" on={currentUser.rolreplication} />
            <AttrBadge label="Bypass RLS" on={currentUser.rolbypassrls} />
            <AttrBadge label="Inherit" on={currentUser.rolinherit} />
          </div>

          {currentUser.memberof.length > 0 && (
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-sm text-muted-foreground mr-1">Member of:</span>
              {currentUser.memberof.map((r) => (
                <Badge key={r} variant="secondary" className="text-xs font-mono">{r}</Badge>
              ))}
            </div>
          )}

          {currentUser.dbPrivileges.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Database privileges:</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Database</TableHead>
                    <TableHead>Connect</TableHead>
                    <TableHead>Create</TableHead>
                    <TableHead>Temp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentUser.dbPrivileges.map((db) => (
                    <TableRow key={db.datname}>
                      <TableCell className="font-mono text-sm">{db.datname}</TableCell>
                      <TableCell><Flag on={db.canConnect} /></TableCell>
                      <TableCell><Flag on={db.canCreate} /></TableCell>
                      <TableCell><Flag on={db.canTemp} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}

      {users.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">All Users</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24 text-muted-foreground">OID</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Superuser</TableHead>
                <TableHead>Create DB</TableHead>
                <TableHead>Create Role</TableHead>
                <TableHead>Replication</TableHead>
                <TableHead>Bypass RLS</TableHead>
                <TableHead>Member of</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow
                  key={u.rolname}
                  className={u.rolname === currentUser?.username ? 'bg-accent/40' : ''}
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">{u.oid}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {u.rolname}
                    {u.rolname === currentUser?.username && (
                      <Badge variant="outline" className="ml-2 text-xs">you</Badge>
                    )}
                  </TableCell>
                  <TableCell><Flag on={u.rolsuper} /></TableCell>
                  <TableCell><Flag on={u.rolcreatedb} /></TableCell>
                  <TableCell><Flag on={u.rolcreaterole} /></TableCell>
                  <TableCell><Flag on={u.rolreplication} /></TableCell>
                  <TableCell><Flag on={u.rolbypassrls} /></TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.memberof.map((r) => (
                        <Badge key={r} variant="secondary" className="text-xs font-mono">{r}</Badge>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  )
}

function Flag({ on }: { on: boolean }) {
  return <Badge variant={on ? 'default' : 'outline'}>{on ? 'Yes' : 'No'}</Badge>
}

function AttrBadge({ label, on }: { label: string; on: boolean }) {
  if (!on) return null
  return <Badge variant="default" className="text-xs">{label}</Badge>
}
