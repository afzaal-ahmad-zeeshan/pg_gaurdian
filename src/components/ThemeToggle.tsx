'use client'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'

const themes = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
] as const

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  if (!mounted) return null

  const current = themes.find((t) => t.value === theme) ?? themes[2]
  const next = themes[(themes.findIndex((t) => t.value === theme) + 1) % themes.length]

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-3 px-3 text-muted-foreground hover:text-foreground"
      onClick={() => setTheme(next.value)}
      title={`Switch to ${next.label}`}
    >
      <current.icon size={16} />
      <span className="text-xs">{current.label}</span>
    </Button>
  )
}
