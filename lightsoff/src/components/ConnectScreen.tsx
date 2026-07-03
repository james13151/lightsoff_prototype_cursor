import { useState } from 'react'
import { apiFetch, checkApiHealth, fetchDevToken } from '../api/client'
import { API_URL, DEV_USER_ID, type AuthSession } from '../api/config'
import { fetchMe } from '../api/members'
import { Button, Card } from './ui'

interface TenantRow {
  id: string
  name: string
  role: string
}

export function ConnectScreen({ onConnect }: { onConnect: (session: AuthSession) => void }) {
  const [userId, setUserId] = useState(DEV_USER_ID)
  const [tenantName, setTenantName] = useState('My Brand')
  const [token, setToken] = useState<string | null>(null)
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [devAuth, setDevAuth] = useState<boolean | null>(null)

  const connect = async () => {
    setBusy(true)
    setError(null)
    try {
      const health = await checkApiHealth()
      setDevAuth(health.devAuth ?? false)
      if (!health.devAuth) {
        throw new Error('API is up but ALLOW_DEV_AUTH is not enabled. Set ALLOW_DEV_AUTH=true on the API host.')
      }
      const t = await fetchDevToken(userId)
      setToken(t)
      const list = await apiFetch<TenantRow[]>('/v1/tenants', { token: t })
      setTenants(list)
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
        <h1 className="text-lg font-semibold">Connect to LightsOff API</h1>
        <p className="mt-1 text-sm text-slate-500">
          Spine modules (Inventory + Finance) load from the real database. Inbox, Marketing, and R&D stay in demo mode until Phase 2/3.
        </p>
        <p className="mt-2 font-mono text-xs text-slate-400">API: {API_URL || '(not configured — demo mode)'}</p>

        <label className="mt-4 block text-sm">
          <span className="text-slate-600">User ID (dev)</span>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>

        {!token ? (
          <Button className="mt-4 w-full" onClick={() => void connect()} disabled={busy}>
            {busy ? 'Connecting…' : 'Connect'}
          </Button>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="text-xs text-emerald-600">● Authenticated {devAuth ? '(dev auth)' : ''}</div>
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
          Local setup: API on :3001 with <code>ALLOW_DEV_AUTH=true</code>, frontend <code>VITE_API_URL=/api</code> (Vite proxy).
        </p>
      </Card>
    </div>
  )
}
