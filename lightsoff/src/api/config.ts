/** API base URL. In local dev, Vite proxies `/api` → localhost:3001. */
import type { MemberRole } from '../lib/permissions'

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export const isApiMode = Boolean(API_URL)

export const AUTH_STORAGE_KEY = 'lightsoff.auth'

export interface AuthSession {
  token: string
  userId: string
  tenantId: string
  tenantName: string
  role?: MemberRole
  displayName?: string
  email?: string
}

export function loadAuth(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AuthSession
  } catch {
    return null
  }
}

export function saveAuth(session: AuthSession) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
}

export function clearAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY)
}

/** Default dev user — must exist in auth.users when using local Postgres. */
export const DEV_USER_ID = '11111111-1111-1111-1111-111111111111'
