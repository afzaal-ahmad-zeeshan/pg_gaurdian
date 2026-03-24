/**
 * Server connection store — persisted to a local JSON file for now.
 * Passwords are stored as-is; in production, encrypt with a secret key.
 */
import fs from 'fs'
import path from 'path'
import { ServerConnection } from '@/types'

const DATA_FILE = path.join(process.cwd(), 'data', 'servers.json')

function ensureFile() {
  const dir = path.dirname(DATA_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]')
}

export function getServers(): ServerConnection[] {
  ensureFile()
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
}

export function getServer(id: string): ServerConnection | undefined {
  return getServers().find((s) => s.id === id)
}

export function saveServer(server: ServerConnection): void {
  ensureFile()
  const servers = getServers()
  const idx = servers.findIndex((s) => s.id === server.id)
  if (idx >= 0) servers[idx] = server
  else servers.push(server)
  fs.writeFileSync(DATA_FILE, JSON.stringify(servers, null, 2))
}

export function deleteServer(id: string): void {
  ensureFile()
  const servers = getServers().filter((s) => s.id !== id)
  fs.writeFileSync(DATA_FILE, JSON.stringify(servers, null, 2))
}
