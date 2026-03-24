'use client'
import { useServerContext } from '@/context/ServerContext'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/**
 * A page-level server switcher — only renders when there are 2+ servers.
 * Shows name in the trigger, name + address in each option.
 */
export function ServerSelect() {
  const { servers, selectedId, setSelectedId } = useServerContext()

  if (servers.length <= 1) return null

  return (
    <Select value={selectedId} onValueChange={(v) => setSelectedId(v ?? '')}>
      <SelectTrigger className="w-52">
        <SelectValue>
          {servers.find((s) => s.id === selectedId)?.name ?? 'Select server'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {servers.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            <div className="flex flex-col py-0.5">
              <span className="font-medium">{s.name}</span>
              <span className="text-xs text-muted-foreground font-mono">
                {s.user}@{s.host}:{s.port}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
