import { useState } from 'react'
import { apiFetch, checkApiHealth, fetchDevToken } from '../api/client'
import { API_URL, DEV_USER_ID, isSupabaseConfigured, type AuthSession } from '../api/config'
import { fetchMe } from '../api/members'
import { getSupabase } from '../lib/supabase'
import { Button, Card } from './ui'

interface TenantRow {
  id: string
  name: string
  role: string
}

type AuthMode = 'supabase' | 'dev'

export function ConnectScreen({ onConnect }: { onConnect: (session: AuthSession) => void }) {
  const [userId, setUserId] = useState(DEV_USER_ID)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tenantName, setTenantName] = useState('My Brand')
  const [token, setToken] = useState<string | null>(null)
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode | null>(null)
  const [signUp, setSignUp] = useState(false)

  const loadTenants = async (accessToken: string, uid: string) => {
    const list = await apiFetch<TenantRow[]>('/v1/tenants', { token: accessToken })
    setToken(accessToken)
    setUserId(uid)
    setTenants(list)
  }

  const connectDev = async () => {
    setBusy(true)
    setError(null)
    try {
      const health = await checkApiHealth()
      if (!health.devAuth) {
        throw new Error('API is up but ALLOW_DEV_AUTH is not enabled. Use Supabase sign-in or enable dev auth locally.')
      }
      const t = await fetchDevToken(userId)
      setAuthMode('dev')
      await loadTenants(t, userId)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const connectSupabase = async () => {
    if (!email.trim() || !password) {
      setError('Email and password are required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const supabase = getSupabase()
      const { data, error: authError } = signUp
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (authError) throw authError
      const session = data.session
      if (!session?.access_token || !session.user?.id) {
        if (signUp) {
          throw new Error('Account created — check your email if confirmation is required, then sign in.')
        }
        throw new Error('No session returned')
      }
      setAuthMode('supabase')
      await loadTenants(session.access_token, session.user.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const createTenant = async () => {
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      const created = await apiFetch<TenantRow>('/v1/tenants', {
        method: 'POST',
        token,
        body: JSON.stringify({ name: tenantName }),
      })
      setTenants((prev) => [...prev, created])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const seedStarter = async (tenantId: string) => {
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      const vendor = await apiFetch<{ id: string }>('/v1/vendors', {
        method: 'POST',
        token,
        body: JSON.stringify({ tenant_id: tenantId, name: 'Acme Textiles', lead_time_days: 12 }),
      })
      await apiFetch('/v1/products', {
        method: 'POST',
        token,
        body: JSON.stringify({
          tenant_id: tenantId,
          title: 'Blue Hoodie',
          variants: [{ sku: 'HOOD-BLU-M', price: 68, unit_cost: 18.5, reorder_point: 20 }],
        }),
      })
      void vendor
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const enter = async (t: TenantRow) => {
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      const me = await fetchMe(token, t.id)
      onConnect({
        token,
        userId,
        tenantId: t.id,
        tenantName: t.name,
        role: me.role,
        displayName: me.display_name,
        email: me.email,
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-lg font-semibold">Connect to LightsOff</h1>
        <p className="mt-1 text-sm text-slate-500">
          Spine modules (Inventory + Finance) load from the real database. Inbox, Marketing, and R&D stay in demo mode until Phase 2/3.
        </p>
        <p className="mt-2 font-mono text-xs text-slate-400">API: {API_URL}</p>

        {!token ? (
          isSupabaseConfigured ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-slate-600">
                {signUp ? 'Create a Supabase account' : 'Sign in with Supabase'}
              </p>
              <label className="block text-sm">
                <span className="text-slate-600">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  autoComplete="email"
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  autoComplete={signUp ? 'new-password' : 'current-password'}
                />
              </label>
              <Button className="w-full" onClick={() => void connectSupabase()} disabled={busy}>
                {busy ? 'Connecting…' : signUp ? 'Sign up' : 'Sign in'}
              </Button>
              <button
                type="button"
                className="w-full text-center text-xs text-slate-500 hover:text-slate-700"
                onClick={() => {
                  setSignUp((v) => !v)
                  setError(null)
                }}
              >
                {signUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="text-slate-600">User ID (dev)</span>
                <input
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <Button className="w-full" onClick={() => void connectDev()} disabled={busy}>
                {busy ? 'Connecting…' : 'Connect (dev auth)'}
              </Button>
            </div>
          )
        ) : (
          <div className="mt-4 space-y-3">
            <div className="text-xs text-emerald-600">
              ● Authenticated {authMode === 'dev' ? '(dev auth)' : '(Supabase)'}
            </div>
            {tenants.length === 0 ? (
              <>
                <p className="text-sm text-slate-600">No workspace yet — create one:</p>
                <input
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Workspace name"
                />
                <Button className="w-full" onClick={() => void createTenant()} disabled={busy}>
                  Create workspace
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-slate-700">Choose workspace</p>
                {tenants.map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <Button className="flex-1" variant="secondary" onClick={() => void enter(t)} disabled={busy}>
                      {t.name} <span className="text-slate-400">({t.role})</span>
                    </Button>
                    <Button variant="ghost" onClick={() => void seedStarter(t.id)} title="Add Acme vendor + Blue Hoodie SKU">
                      + seed
                    </Button>
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <input
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <Button variant="ghost" onClick={() => void createTenant()} disabled={busy}>
                    New
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

        <p className="mt-6 text-[11px] text-slate-400">
          {isSupabaseConfigured
            ? 'Production: Supabase Auth + API on Render/Fly. See docs/DEPLOY.md.'
            : 'Local: API on :3001 with ALLOW_DEV_AUTH=true, frontend VITE_API_URL=/api (Vite proxy).'}
        </p>
      </Card>
    </div>
  )
}
