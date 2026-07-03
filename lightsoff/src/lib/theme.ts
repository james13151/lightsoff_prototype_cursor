const STORAGE_KEY = 'lightsoff.theme'

export type Theme = 'light' | 'dark' | 'system'

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch { /* ignore */ }
  return 'system'
}

export function resolveDark(theme: Theme): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyTheme(theme: Theme) {
  const dark = resolveDark(theme)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

export function setStoredTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme)
  applyTheme(theme)
}

/** Call once before React mounts to avoid flash */
export function initTheme() {
  applyTheme(getStoredTheme())
}
