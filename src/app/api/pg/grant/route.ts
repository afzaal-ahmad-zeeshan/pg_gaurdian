import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db/client'

export type GrantObjectType =
  | 'schema'
  | 'table'
  | 'database'
  | 'sequence'
  | 'function'
  | 'all_tables'
  | 'all_sequences'
  | 'all_functions'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { connection, mode } = body

  if (!connection) return NextResponse.json({ error: 'Missing connection' }, { status: 400 })

  const pool = getPool(connection)

  // ── Object list for dropdowns ───────────────────────────────────────────────
  if (mode === 'resources') {
    const { type } = body as { type: GrantObjectType }
    try {
      let sql: string
      switch (type) {
        case 'database':
          sql = `SELECT datname AS name FROM pg_catalog.pg_database WHERE NOT datistemplate ORDER BY datname`
          break
        case 'schema':
        case 'all_tables':
        case 'all_sequences':
        case 'all_functions':
          sql = `SELECT nspname AS name FROM pg_catalog.pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY nspname`
          break
        case 'table':
          sql = `SELECT n.nspname||'.'||c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','v','m','f','p') AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY name`
          break
        case 'sequence':
          sql = `SELECT n.nspname||'.'||c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S' AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY name`
          break
        case 'function':
          sql = `SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS name FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') ORDER BY name`
          break
        default:
          return NextResponse.json({ objects: [] })
      }
      const { rows } = await pool.query<{ name: string }>(sql)
      return NextResponse.json({ objects: rows.map((r) => r.name) })
    } catch {
      return NextResponse.json({ objects: [] })
    }
  }

  // ── Current grants for a role on a specific object ──────────────────────────
  if (mode === 'current') {
    const { role, type, object } = body as { role: string; type: GrantObjectType; object: string }
    try {
      let sql: string
      switch (type) {
        case 'database':
          sql = `SELECT privilege_type FROM information_schema.role_usage_grants WHERE grantee=$1 UNION SELECT privilege_type FROM (SELECT (aclexplode(datacl)).* FROM pg_database WHERE datname=$2) x JOIN pg_roles r ON r.oid=x.grantee WHERE r.rolname=$1`
          break
        case 'schema': {
          const [schemaName] = object.split('.')
          sql = `SELECT privilege_type FROM information_schema.role_schema_grants WHERE grantee=$1 AND table_schema=$2`
          const { rows } = await pool.query<{ privilege_type: string }>(sql, [role, schemaName])
          return NextResponse.json({ grants: rows.map((r) => r.privilege_type) })
        }
        case 'table': {
          sql = `SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee=$1 AND table_schema||'.'||table_name=$2`
          const { rows } = await pool.query<{ privilege_type: string }>(sql, [role, object])
          return NextResponse.json({ grants: rows.map((r) => r.privilege_type) })
        }
        default:
          return NextResponse.json({ grants: [] })
      }
      const { rows } = await pool.query<{ privilege_type: string }>(sql, [role, object])
      return NextResponse.json({ grants: rows.map((r) => r.privilege_type) })
    } catch {
      return NextResponse.json({ grants: [] })
    }
  }

  // ── Verify current privilege state after an operation ──────────────────────
  if (mode === 'verify') {
    const { role, objectType, object, privileges, action, includeDefaultPrivs } =
      body as {
        role: string
        objectType: GrantObjectType
        object: string
        privileges: string[]
        action: 'GRANT' | 'REVOKE'
        includeDefaultPrivs: boolean
      }

    const expected = action === 'GRANT'

    // Is this role a superuser? Superusers always have effective access regardless of ACLs.
    const { rows: superRows } = await pool.query<{ rolsuper: boolean; rolinherit: boolean }>(
      `SELECT rolsuper, rolinherit FROM pg_roles WHERE rolname = $1`, [role]
    )
    const isSuperuser = superRows[0]?.rolsuper ?? false
    const roleInherits = superRows[0]?.rolinherit ?? true

    type PrivResult = {
      privilege: string
      effective: boolean
      directGrant: boolean
      viaPublic: boolean
      viaInheritance: boolean
      defaultPrivSet: boolean | null
      expected: boolean
      ok: boolean
      explanation: string | null
    }

    const results: PrivResult[] = []

    // ── Direct object types ──────────────────────────────────────────────────
    if (['schema', 'table', 'database', 'sequence', 'function'].includes(objectType)) {
      for (const priv of privileges) {
        try {
          // Effective privilege via PostgreSQL's own check function
          let effectiveSql: string
          let aclSql: string
          let publicSql: string
          let aclParams: unknown[]

          if (objectType === 'schema') {
            effectiveSql = `SELECT has_schema_privilege($1, $2, $3) AS v`
            publicSql   = `SELECT has_schema_privilege('public', $1, $2) AS v`
            aclSql = `
              SELECT EXISTS (
                SELECT 1
                FROM pg_namespace n
                CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a
                JOIN pg_roles r ON r.oid = a.grantee AND r.rolname = $1
                WHERE n.nspname = $3 AND a.privilege_type = $2
              ) AS v`
            aclParams = [role, priv, object]
          } else if (objectType === 'database') {
            effectiveSql = `SELECT has_database_privilege($1, $2, $3) AS v`
            publicSql   = `SELECT has_database_privilege('public', $1, $2) AS v`
            aclSql = `
              SELECT EXISTS (
                SELECT 1
                FROM pg_database d
                CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl, acldefault('d', d.datdba))) a
                JOIN pg_roles r ON r.oid = a.grantee AND r.rolname = $1
                WHERE d.datname = $3 AND a.privilege_type = $2
              ) AS v`
            aclParams = [role, priv, object]
          } else if (objectType === 'table') {
            effectiveSql = `SELECT has_table_privilege($1, $2, $3) AS v`
            publicSql   = `SELECT has_table_privilege('public', $1, $2) AS v`
            aclSql = `
              SELECT EXISTS (
                SELECT 1
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
                JOIN pg_roles r ON r.oid = a.grantee AND r.rolname = $1
                WHERE n.nspname||'.'||c.relname = $3 AND a.privilege_type = $2
              ) AS v`
            aclParams = [role, priv, object]
          } else if (objectType === 'sequence') {
            effectiveSql = `SELECT has_sequence_privilege($1, $2, $3) AS v`
            publicSql   = `SELECT has_sequence_privilege('public', $1, $2) AS v`
            aclSql = `
              SELECT EXISTS (
                SELECT 1
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('S', c.relowner))) a
                JOIN pg_roles r ON r.oid = a.grantee AND r.rolname = $1
                WHERE n.nspname||'.'||c.relname = $3 AND a.privilege_type = $2
              ) AS v`
            aclParams = [role, priv, object]
          } else {
            // function
            effectiveSql = `SELECT has_function_privilege($1, $2, $3) AS v`
            publicSql   = `SELECT has_function_privilege('public', $1, $2) AS v`
            aclSql = `SELECT false AS v` // function ACL check is complex, skip direct check
            aclParams = [role, priv, object]
          }

          const [effRow, pubRow, aclRow] = await Promise.all([
            pool.query<{ v: boolean }>(effectiveSql, [role, object, priv]),
            pool.query<{ v: boolean }>(publicSql, [object, priv]),
            aclSql !== `SELECT false AS v`
              ? pool.query<{ v: boolean }>(aclSql, aclParams)
              : Promise.resolve({ rows: [{ v: false }] }),
          ])

          const effective = effRow.rows[0]?.v ?? false
          const viaPublic = pubRow.rows[0]?.v ?? false
          const directGrant = aclRow.rows[0]?.v ?? false
          // Inheritance: effective but not direct and not superuser
          const viaInheritance = effective && !directGrant && !viaPublic && !isSuperuser && roleInherits

          const ok = effective === expected
          let explanation: string | null = null

          if (!ok) {
            if (expected && !effective) {
              explanation = isSuperuser
                ? `${role} is a superuser — the grant ran but superusers bypass privilege checks.`
                : `Grant was recorded but has_${objectType}_privilege() still returns false. The role may not exist on this database, or the object name may differ.`
            } else if (!expected && effective) {
              if (viaPublic) explanation = `Still effective because this privilege is also granted to PUBLIC (all roles). Revoke it from PUBLIC to fully remove access: REVOKE ${priv} ON ${objectType.toUpperCase()} ${object} FROM PUBLIC;`
              else if (viaInheritance) explanation = `Still effective via role membership inheritance — ${role} belongs to another role that holds this privilege.`
              else if (isSuperuser) explanation = `${role} is a superuser; superusers always have full access regardless of ACL revocations.`
              else explanation = `Privilege appears effective even after revoke. Another grant path (e.g. a parent role) may be providing access.`
            }
          }

          results.push({ privilege: priv, effective, directGrant, viaPublic, viaInheritance, defaultPrivSet: null, expected, ok, explanation })
        } catch (err) {
          results.push({ privilege: priv, effective: false, directGrant: false, viaPublic: false, viaInheritance: false, defaultPrivSet: null, expected, ok: false, explanation: err instanceof Error ? err.message : String(err) })
        }
      }

    // ── Bulk types (all_tables / all_sequences / all_functions) ─────────────
    } else {
      const relkindMap: Record<string, string> = { all_tables: `IN ('r','v','m','f','p')`, all_sequences: `= 'S'`, all_functions: '' }
      const isFunctions = objectType === 'all_functions'

      for (const priv of privileges) {
        try {
          // Count of objects in schema where this role has the privilege
          let countSql: string
          let defaultPrivType: string

          if (isFunctions) {
            countSql = `
              SELECT COUNT(*) AS total,
                     SUM(CASE WHEN has_function_privilege($1, p.oid, $2) THEN 1 ELSE 0 END) AS granted
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = $3`
            defaultPrivType = 'f'
          } else {
            const kind = relkindMap[objectType]
            countSql = `
              SELECT COUNT(*) AS total,
                     SUM(CASE WHEN has_${objectType === 'all_tables' ? 'table' : 'sequence'}_privilege($1, n.nspname||'.'||c.relname, $2) THEN 1 ELSE 0 END) AS granted
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE c.relkind ${kind} AND n.nspname = $3
                AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')`
            defaultPrivType = objectType === 'all_tables' ? 'r' : 'S'
          }

          // Check default privs in pg_default_acl
          const defaultSql = `
            SELECT EXISTS (
              SELECT 1 FROM pg_default_acl d
              LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
              CROSS JOIN LATERAL aclexplode(d.defaclacl) a
              JOIN pg_roles r ON r.oid = a.grantee AND r.rolname = $1
              WHERE a.privilege_type = $2
                AND (n.nspname = $3 OR d.defaclnamespace = 0)
                AND d.defaclobjtype = $4
            ) AS v`

          const [countRow, defaultRow] = await Promise.all([
            pool.query<{ total: string; granted: string }>(countSql, [role, priv, object]),
            includeDefaultPrivs
              ? pool.query<{ v: boolean }>(defaultSql, [role, priv, object, defaultPrivType])
              : Promise.resolve({ rows: [{ v: null }] }),
          ])

          const total = parseInt(countRow.rows[0]?.total ?? '0')
          const granted = parseInt(countRow.rows[0]?.granted ?? '0')
          const defaultPrivSet = defaultRow.rows[0]?.v ?? null
          const effective = expected ? granted > 0 : granted === 0
          const ok = effective === expected

          let explanation: string | null = null
          if (!ok) {
            if (expected && granted === 0 && total === 0) {
              explanation = `No objects of this type exist in schema "${object}" yet. Grants on "ALL TABLES/SEQUENCES/FUNCTIONS" only apply to existing objects — use Default Privileges for future ones.`
            } else if (expected && granted < total) {
              explanation = `${priv} applied to ${granted} of ${total} object(s). Some objects may have restrictive ACLs that override the grant.`
            } else if (!expected && granted > 0) {
              explanation = `${priv} still effective on ${granted} of ${total} object(s). Revoke may not cascade to all objects, or access comes via PUBLIC or role inheritance.`
            }
          }

          // Encode count info into the result
          results.push({
            privilege: priv,
            effective,
            directGrant: granted === total && total > 0,
            viaPublic: false,
            viaInheritance: false,
            defaultPrivSet,
            expected,
            ok,
            explanation: explanation ?? (total > 0 ? `${priv}: ${granted}/${total} objects in schema "${object}" now have this privilege.` : null),
          })
        } catch (err) {
          results.push({ privilege: priv, effective: false, directGrant: false, viaPublic: false, viaInheritance: false, defaultPrivSet: null, expected, ok: false, explanation: err instanceof Error ? err.message : String(err) })
        }
      }
    }

    return NextResponse.json({ isSuperuser, results })
  }

  // ── Execute GRANT / REVOKE statements ───────────────────────────────────────
  if (mode === 'execute') {
    const { statements } = body as { statements: string[] }
    if (!statements?.length) return NextResponse.json({ error: 'No statements' }, { status: 400 })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const results: { sql: string; ok: boolean; error?: string }[] = []
      for (const sql of statements) {
        try {
          await client.query(sql)
          results.push({ sql, ok: true })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          results.push({ sql, ok: false, error: message })
          await client.query('ROLLBACK')
          return NextResponse.json({ ok: false, results, rolledBack: true })
        }
      }
      await client.query('COMMIT')
      return NextResponse.json({ ok: true, results, rolledBack: false })
    } catch (err) {
      try { await client.query('ROLLBACK') } catch { /* ignore */ }
      return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err), rolledBack: true }, { status: 500 })
    } finally {
      client.release()
    }
  }

  return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
}
