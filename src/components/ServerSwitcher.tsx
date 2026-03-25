'use client'
import { Check, ChevronsUpDown, ServerIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useServerContext } from '@/context/ServerContext'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export function ServerSwitcher() {
  const { servers, selectedId, setSelectedId, selected } = useServerContext()

  if (servers.length === 0) {
    return (
      <div className="px-3 py-2 rounded-md border border-dashed border-border">
        <p className="text-xs text-muted-foreground">No servers added</p>
      </div>
    )
  }

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'w-full overflow-hidden flex items-center justify-between rounded-md px-3 py-2 text-left',
          'hover:bg-accent transition-colors cursor-pointer'
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ServerIcon size={14} className="text-muted-foreground shrink-0" />
          <div className="flex flex-col items-start min-w-0">
            <span className="text-sm font-medium truncate leading-tight">
              {selected?.name ?? 'Select server'}
            </span>
            {selected && (
              <span className="text-xs text-muted-foreground font-mono truncate leading-tight">
                {selected.user}@{selected.host}:{selected.port}
              </span>
            )}
          </div>
        </div>
        <ChevronsUpDown size={14} className="text-muted-foreground shrink-0 ml-1" />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start" side="right">
        <div className="space-y-0.5">
          {servers.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={cn(
                'w-full flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent',
                s.id === selectedId && 'bg-accent'
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{s.name}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {s.user}@{s.host}:{s.port}/{s.database}
                </p>
              </div>
              {s.id === selectedId && <Check size={14} className="text-primary shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
