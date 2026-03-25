import { Pool, PoolConfig } from 'pg'
import { ServerConnection } from '@/types'

const pools = new Map<string, Pool>()

function poolKey(s: ServerConnection) {
  return `${s.host}:${s.port}/${s.database}@${s.user}?ssl=${!!s.ssl}`
}

export function getPool(server: ServerConnection): Pool {
  const key = poolKey(server)
  if (pools.has(key)) return pools.get(key)!

  const config: PoolConfig = {
    host: server.host,
    port: server.port,
    database: server.database,
    user: server.user,
    password: server.password,
    ssl: server.ssl ? { rejectUnauthorized: false } : false,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  }

  const pool = new Pool(config)
  pools.set(key, pool)
  return pool
}
