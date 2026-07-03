import { useEffect, useState } from 'react'
import { getStoredTheme, setStoredTheme, type Theme } from '../lib/theme'
import { Button } from './ui'

const LABELS: Record<Theme, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
}

export function ThemeToggle({ compact }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme())

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (getStoredTheme() === 'system') setStoredTheme('system')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const cycle = () => {
    const next: Theme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    setTheme(next)
    setStoredTheme(next)
  }

  const icon = theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '◐'

  if (compact) {
    return (
      <button
        type="button"
        onClick={cycle}
        title={`Theme: ${LABELS[theme]}`}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
      >
        <span>{icon}</span>
        <span>{LABELS[theme]} mode</span>
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-ink-muted">Appearance</span>
      <Button variant="secondary" onClick={cycle}>
        {icon} {LABELS[theme]}
      </Button>
    </div>
  )
}
