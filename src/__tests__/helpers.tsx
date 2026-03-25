/**
 * Shared test utilities — wrappers, fixtures, and mock data.
 */
import { type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ServerProvider } from '@/context/ServerContext'
import type { PgRole, PgDatabase, PgCurrentUser, ServerConnection, PermissionsMatrix } from '@/types'

// ─── Fixtures ──────────────────────────────────────────────────────────────

export const mockServer: ServerConnection = {
  id: 'server-1',
  name: 'Test Server',
  host: 'localhost',
  port: 5432,
  database: 'testdb',
  user: 'testuser',
  password: 'secret',
}

export const mockServer2: ServerConnection = {
  id: 'server-2',
  name: 'Staging',
  host: '10.0.0.2',
  port: 5432,
  database: 'stagingdb',
  user: 'staginguser',
  password: 'pass',
}

export const mockRoles: PgRole[] = [
  {
    oid: 10,
    rolname: 'admin',
    rolsuper: true,
    rolinherit: true,
    rolcreaterole: true,
    rolcreatedb: true,
    rolcanlogin: true,
    rolreplication: false,
    rolbypassrls: false,
    rolconnlimit: -1,
    rolvaliduntil: null,
    memberof: [],
  },
  {
    oid: 16384,
    rolname: 'readonly',
    rolsuper: false,
    rolinherit: true,
    rolcreaterole: false,
    rolcreatedb: false,
    rolcanlogin: true,
    rolreplication: false,
    rolbypassrls: false,
    rolconnlimit: -1,
    rolvaliduntil: null,
    memberof: ['pg_read_all_data'],
  },
]

export const mockDatabases: PgDatabase[] = [
  { oid: 1, datname: 'postgres', owner: 'pg_admin', datacl: null },
  { oid: 2, datname: 'testdb', owner: 'testuser', datacl: ['=Tc/postgres', 'postgres=CTc/postgres'] },
]

export const mockCurrentUser: PgCurrentUser = {
  username: 'testuser',
  sessionUser: 'testuser',
  rolsuper: false,
  rolinherit: true,
  rolcreaterole: false,
  rolcreatedb: false,
  rolcanlogin: true,
  rolreplication: false,
  rolbypassrls: false,
  rolconnlimit: -1,
  rolvaliduntil: null,
  memberof: ['app_user'],
  dbPrivileges: [
    { datname: 'postgres', canConnect: true, canCreate: false, canTemp: true },
    { datname: 'testdb', canConnect: true, canCreate: true, canTemp: true },
  ],
}

export const mockMatrix: PermissionsMatrix = {
  rolename: 'admin',
  databases: [
    { name: 'postgres', connect: true, create: false, temp: true },
    { name: 'testdb',   connect: true, create: true,  temp: true },
  ],
  schemas: [
    { name: 'public', usage: true, create: false },
  ],
  tables: [
    { schema: 'public', name: 'users', kind: 'r', select: true, insert: false, update: false, delete: false, truncate: false, references: false, trigger: false },
    { schema: 'public', name: 'orders_view', kind: 'v', select: true, insert: false, update: false, delete: false, truncate: false, references: false, trigger: false },
  ],
  sequences: [
    { schema: 'public', name: 'users_id_seq', usage: true, select: true, update: false },
  ],
  functions: [
    { schema: 'public', name: 'get_user', kind: 'f', args: 'id integer', execute: true },
  ],
  types: [
    { schema: 'public', name: 'status_enum', kind: 'e', usage: true },
  ],
  fdws: [
    { name: 'postgres_fdw', usage: false },
  ],
  foreignServers: [
    { name: 'remote_server', usage: true },
  ],
}

// ─── Wrapper factories ─────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

/** Basic wrapper — no pre-loaded servers. */
export function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={makeQC()}>
      <ServerProvider>{children}</ServerProvider>
    </QueryClientProvider>
  )
}

/** Wrapper that pre-loads one server into localStorage so context auto-selects it. */
export function WrapperWithServer({ children }: { children: ReactNode }) {
  localStorage.setItem('pg_guardian_servers', JSON.stringify([mockServer]))
  return (
    <QueryClientProvider client={makeQC()}>
      <ServerProvider>{children}</ServerProvider>
    </QueryClientProvider>
  )
}

/** Wrapper that pre-loads two servers (enables ServerSelect dropdown). */
export function WrapperWithTwoServers({ children }: { children: ReactNode }) {
  localStorage.setItem('pg_guardian_servers', JSON.stringify([mockServer, mockServer2]))
  return (
    <QueryClientProvider client={makeQC()}>
      <ServerProvider>{children}</ServerProvider>
    </QueryClientProvider>
  )
}

// ─── Fetch mock helpers ────────────────────────────────────────────────────

export function mockFetchOnce(data: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(data),
    } as Response),
  )
}

export function mockFetchSequence(...responses: unknown[]) {
  const fn = vi.fn()
  for (const data of responses) {
    fn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(data),
    } as Response)
  }
  vi.stubGlobal('fetch', fn)
  return fn
}
