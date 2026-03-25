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
