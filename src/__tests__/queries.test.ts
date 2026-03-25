/**
 * DB Query Tests — src/lib/db/queries.ts
 *
 * Covers every exported function with a mocked pg Pool.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Pool } from 'pg'
import {
  getRoles,
  getDatabases,
  getUsers,
  getCurrentUserInfo,
  getTablePrivileges,
  createRole,
  dropRole,
  grantRole,
  revokeRole,
  getPermissionsMatrix,
} from '@/lib/db/queries'

// ─── Mock pool factory ────────────────────────────────────────────────────
function makePool(responses: Array<{ rows: unknown[] }>) {
  const mockQuery = vi.fn()
  for (const r of responses) mockQuery.mockResolvedValueOnce(r)
  return { query: mockQuery } as unknown as Pool
}

// ─── getRoles ─────────────────────────────────────────────────────────────
describe('getRoles', () => {
  it('returns roles with memberof normalized to an array', async () => {
    const pool = makePool([
      {
        rows: [
          {
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
            memberof: ['pg_read_all_data'],
          },
        ],
      },
    ])
    const roles = await getRoles(pool)
    expect(roles).toHaveLength(1)
    expect(roles[0].rolname).toBe('admin')
    expect(roles[0].memberof).toEqual(['pg_read_all_data'])
  })

  it('normalizes null memberof to an empty array', async () => {
    const pool = makePool([
      {
        rows: [
          {
            rolname: 'norole',
            rolsuper: false, rolinherit: true, rolcreaterole: false, rolcreatedb: false,
            rolcanlogin: false, rolreplication: false, rolbypassrls: false,
            rolconnlimit: -1, rolvaliduntil: null,
            memberof: null,
          },
        ],
      },
    ])
    const roles = await getRoles(pool)
    expect(roles[0].memberof).toEqual([])
  })

  it('returns empty array when no roles exist', async () => {
    const pool = makePool([{ rows: [] }])
    const roles = await getRoles(pool)
    expect(roles).toEqual([])
  })
})

// ─── getDatabases ─────────────────────────────────────────────────────────
describe('getDatabases', () => {
  it('returns databases from query result', async () => {
    const pool = makePool([
      { rows: [{ datname: 'postgres', datdba: 10, datacl: null }] },
    ])
    const dbs = await getDatabases(pool)
    expect(dbs).toHaveLength(1)
    expect(dbs[0].datname).toBe('postgres')
  })

  it('returns empty array when no databases', async () => {
    const pool = makePool([{ rows: [] }])
    expect(await getDatabases(pool)).toEqual([])
  })
})

// ─── getUsers ─────────────────────────────────────────────────────────────
describe('getUsers', () => {
  it('returns only login-enabled roles with normalized memberof', async () => {
    const pool = makePool([
      {
        rows: [
          {
            rolname: 'appuser',
            rolsuper: false, rolinherit: true, rolcreaterole: false, rolcreatedb: false,
            rolcanlogin: true, rolreplication: false, rolbypassrls: false,
            rolconnlimit: -1, rolvaliduntil: null,
            memberof: ['app_role'],
          },
        ],
      },
    ])
    const users = await getUsers(pool)
    expect(users).toHaveLength(1)
    expect(users[0].rolcanlogin).toBe(true)
    expect(users[0].memberof).toEqual(['app_role'])
  })
})

// ─── getCurrentUserInfo ───────────────────────────────────────────────────
describe('getCurrentUserInfo', () => {
  it('returns combined user info from three sequential queries', async () => {
    const pool = makePool([
      { rows: [{ username: 'testuser', session_user: 'testuser' }] },
      {
        rows: [{
          rolsuper: false, rolinherit: true, rolcreaterole: false, rolcreatedb: false,
          rolcanlogin: true, rolreplication: false, rolbypassrls: false,
          rolconnlimit: -1, rolvaliduntil: null, memberof: ['app_user'],
        }],
      },
      {
        rows: [
          { datname: 'postgres', can_connect: true, can_create: false, can_temp: true },
          { datname: 'testdb', can_connect: true, can_create: true, can_temp: true },
        ],
      },
    ])

    const result = await getCurrentUserInfo(pool)
    expect(result.username).toBe('testuser')
    expect(result.sessionUser).toBe('testuser')
    expect(result.rolcanlogin).toBe(true)
    expect(result.memberof).toEqual(['app_user'])
    expect(result.dbPrivileges).toHaveLength(2)
    expect(result.dbPrivileges[0]).toEqual({ datname: 'postgres', canConnect: true, canCreate: false, canTemp: true })
  })

  it('falls back to safe defaults when pg_roles returns no row', async () => {
    const pool = makePool([
      { rows: [{ username: 'ghost', session_user: 'ghost' }] },
      { rows: [] },
      { rows: [] },
    ])
    const result = await getCurrentUserInfo(pool)
    expect(result.username).toBe('ghost')
    expect(result.rolsuper).toBe(false)
    expect(result.dbPrivileges).toEqual([])
  })
})

// ─── getTablePrivileges ───────────────────────────────────────────────────
describe('getTablePrivileges', () => {
  it('returns rows from information_schema', async () => {
    const pool = makePool([
      {
        rows: [{
          grantee: 'readonly', table_schema: 'public', table_name: 'users',
          privilege_type: 'SELECT', is_grantable: 'NO',
        }],
      },
    ])
    const privs = await getTablePrivileges(pool, 'testdb')
    expect(privs).toHaveLength(1)
    expect(privs[0].grantee).toBe('readonly')
  })
})

// ─── createRole ───────────────────────────────────────────────────────────
describe('createRole', () => {
  it('sends CREATE ROLE without options', async () => {
    const pool = makePool([{ rows: [] }])
    await createRole(pool, 'newrole', {})
    expect((pool as any).query).toHaveBeenCalledWith('CREATE ROLE "newrole"')
  })

  it('includes LOGIN when canLogin is true', async () => {
    const pool = makePool([{ rows: [] }])
    await createRole(pool, 'loginrole', { canLogin: true })
    const sql: string = (pool as any).query.mock.calls[0][0]
    expect(sql).toContain('LOGIN')
  })

  it('includes SUPERUSER when superuser is true', async () => {
    const pool = makePool([{ rows: [] }])
    await createRole(pool, 'superrole', { superuser: true })
    const sql: string = (pool as any).query.mock.calls[0][0]
    expect(sql).toContain('SUPERUSER')
  })

  it('includes CREATEDB when createDb is true', async () => {
    const pool = makePool([{ rows: [] }])
    await createRole(pool, 'dbmaker', { createDb: true })
    const sql: string = (pool as any).query.mock.calls[0][0]
    expect(sql).toContain('CREATEDB')
  })

  it('escapes single quotes in passwords', async () => {
    const pool = makePool([{ rows: [] }])
    await createRole(pool, 'userrole', { password: "pass'word" })
    const sql: string = (pool as any).query.mock.calls[0][0]
    expect(sql).toContain("pass''word")
  })
})

// ─── dropRole ────────────────────────────────────────────────────────────
describe('dropRole', () => {
  it('sends DROP ROLE IF EXISTS with quoted name', async () => {
    const pool = makePool([{ rows: [] }])
    await dropRole(pool, 'oldrole')
    expect((pool as any).query).toHaveBeenCalledWith('DROP ROLE IF EXISTS "oldrole"')
  })
})

// ─── getPermissionsMatrix ─────────────────────────────────────────────────
describe('getPermissionsMatrix', () => {
  // Helper: build a pool whose query mock returns responses in order.
  // The 8 parallel Promise.all calls each consume one response.
  function matrixPool(overrides: Partial<Record<
    'databases' | 'schemas' | 'tables' | 'sequences' | 'functions' | 'types' | 'fdws' | 'foreignServers',
    { rows: unknown[] } | Error
  >> = {}) {
    const defaults: Record<string, { rows: unknown[] }> = {
      databases: { rows: [{ name: 'postgres', connect: true, create_db: false, temp: true }] },
      schemas:   { rows: [{ name: 'public', usage: true, create_schema: false }] },
      tables:    { rows: [{ schema_name: 'public', name: 'users', kind: 'r', sel: true, ins: false, upd: false, del: false, trunc: false, refs: false, trig: false }] },
      sequences: { rows: [{ schema_name: 'public', name: 'users_id_seq', usage: true, sel: true, upd: false }] },
      functions: { rows: [{ schema_name: 'public', name: 'get_user', kind: 'f', args: 'id integer', execute: true }] },
      types:     { rows: [{ schema_name: 'public', name: 'status_enum', kind: 'e', usage: true }] },
      fdws:      { rows: [{ name: 'postgres_fdw', usage: false }] },
      foreignServers: { rows: [{ name: 'remote_server', usage: true }] },
    }
    const order = ['databases', 'schemas', 'tables', 'sequences', 'functions', 'types', 'fdws', 'foreignServers'] as const
    const mockQuery = vi.fn()
    for (const key of order) {
      const response = overrides[key] ?? defaults[key]
      if (response instanceof Error) {
        mockQuery.mockRejectedValueOnce(response)
      } else {
        mockQuery.mockResolvedValueOnce(response)
      }
    }
    return { query: mockQuery } as unknown as Pool
  }

  it('maps all 8 sections from parallel queries', async () => {
    const pool = matrixPool()
    const result = await getPermissionsMatrix(pool, 'readonly')

    expect(result.rolename).toBe('readonly')
    expect(result.databases).toEqual([{ name: 'postgres', connect: true, create: false, temp: true }])
    expect(result.schemas).toEqual([{ name: 'public', usage: true, create: false }])
    expect(result.tables).toEqual([{ schema: 'public', name: 'users', kind: 'r', select: true, insert: false, update: false, delete: false, truncate: false, references: false, trigger: false }])
    expect(result.sequences).toEqual([{ schema: 'public', name: 'users_id_seq', usage: true, select: true, update: false }])
    expect(result.functions).toEqual([{ schema: 'public', name: 'get_user', kind: 'f', args: 'id integer', execute: true }])
    expect(result.types).toEqual([{ schema: 'public', name: 'status_enum', kind: 'e', usage: true }])
    expect(result.fdws).toEqual([{ name: 'postgres_fdw', usage: false }])
    expect(result.foreignServers).toEqual([{ name: 'remote_server', usage: true }])
  })

  it('returns empty array for a section when its query throws (safe wrapper)', async () => {
    const pool = matrixPool({ schemas: new Error('permission denied on pg_namespace') })
    const result = await getPermissionsMatrix(pool, 'limited')

    expect(result.databases).toHaveLength(1)
    expect(result.schemas).toEqual([])   // safe() caught the error
    expect(result.tables).toHaveLength(1) // other sections unaffected
  })

  it('correctly maps field aliases for databases (create_db → create)', async () => {
    const pool = matrixPool({
      databases: { rows: [{ name: 'mydb', connect: false, create_db: true, temp: false }] },
    })
    const result = await getPermissionsMatrix(pool, 'dba')
    expect(result.databases[0]).toEqual({ name: 'mydb', connect: false, create: true, temp: false })
  })

  it('correctly maps field aliases for schemas (create_schema → create)', async () => {
    const pool = matrixPool({
      schemas: { rows: [{ name: 'app', usage: false, create_schema: true }] },
    })
    const result = await getPermissionsMatrix(pool, 'dba')
    expect(result.schemas[0]).toEqual({ name: 'app', usage: false, create: true })
  })

  it('correctly maps table field aliases (sel/ins/upd/del/trunc/refs/trig)', async () => {
    const pool = matrixPool({
      tables: { rows: [{ schema_name: 'public', name: 't', kind: 'r', sel: false, ins: true, upd: true, del: true, trunc: false, refs: true, trig: false }] },
    })
    const result = await getPermissionsMatrix(pool, 'writer')
    expect(result.tables[0]).toMatchObject({ select: false, insert: true, update: true, delete: true, truncate: false, references: true, trigger: false })
  })

  it('returns empty arrays for all sections when every query throws', async () => {
    const err = new Error('no access')
    const pool = matrixPool({
      databases: err, schemas: err, tables: err, sequences: err,
      functions: err, types: err, fdws: err, foreignServers: err,
    })
    const result = await getPermissionsMatrix(pool, 'nobody')
    expect(result.databases).toEqual([])
    expect(result.schemas).toEqual([])
    expect(result.tables).toEqual([])
    expect(result.sequences).toEqual([])
    expect(result.functions).toEqual([])
    expect(result.types).toEqual([])
    expect(result.fdws).toEqual([])
    expect(result.foreignServers).toEqual([])
  })
})

// ─── grantRole ───────────────────────────────────────────────────────────
describe('grantRole', () => {
  it('sends GRANT role TO role', async () => {
    const pool = makePool([{ rows: [] }])
    await grantRole(pool, 'myrole', 'targetrole')
    expect((pool as any).query).toHaveBeenCalledWith('GRANT "myrole" TO "targetrole"')
  })
})

// ─── revokeRole ──────────────────────────────────────────────────────────
describe('revokeRole', () => {
  it('sends REVOKE role FROM role', async () => {
    const pool = makePool([{ rows: [] }])
    await revokeRole(pool, 'myrole', 'targetrole')
    expect((pool as any).query).toHaveBeenCalledWith('REVOKE "myrole" FROM "targetrole"')
  })
})
