"use client"

import { Code2 } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export interface SqlQuery {
  label?: string
  sql: string
}

interface SqlQueryButtonProps {
  queries: SqlQuery | SqlQuery[]
}

export function SqlQueryButton({ queries }: SqlQueryButtonProps) {
  const list = Array.isArray(queries) ? queries : [queries]

  return (
    <TooltipProvider delay={400}>
    <Tooltip>
      <TooltipTrigger
        tabIndex={-1}
        aria-label="View SQL query"
        className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-foreground cursor-default select-none focus:outline-none transition-colors"
      >
        <Code2 size={14} />
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="end"
        className="max-w-[560px] w-max p-0 overflow-hidden"
      >
        <div className="space-y-0 divide-y divide-border">
          {list.map((q, i) => (
            <div key={i} className="p-3 space-y-1.5">
              {q.label && (
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {q.label}
                </p>
              )}
              <pre className="font-mono text-[11px] leading-relaxed whitespace-pre text-foreground overflow-x-auto max-h-64">
                {q.sql.trim()}
              </pre>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
    </TooltipProvider>
  )
}
