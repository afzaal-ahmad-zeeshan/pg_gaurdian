'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Database, Users, Shield, Server, UserCog } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import { ServerSwitcher } from './ServerSwitcher'

const nav = [
  { href: '/', label: 'Servers', icon: Server },
  { href: '/users', label: 'Users', icon: UserCog },
  { href: '/roles', label: 'Roles', icon: Users },
  { href: '/databases', label: 'Databases', icon: Database },
  { href: '/permissions', label: 'Permissions', icon: Shield },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 border-r border-border bg-card flex flex-col py-4 gap-1 px-2">
      <div className="px-3 pb-4">
        <span className="text-lg font-semibold tracking-tight">pg_guardian</span>
      </div>

      {nav.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            pathname === href
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <Icon size={16} />
          {label}
        </Link>
      ))}

      <div className="mt-auto flex flex-col gap-1 pt-2 border-t border-border">
        <ServerSwitcher />
        <ThemeToggle />
      </div>
    </aside>
  )
}
