import { useEffect, useState } from 'react'
import { useStore } from './store'
import type { AuthSession } from './api/config'
import { CaptureBar } from './components/CaptureBar'
import { Digest } from './components/Digest'
import { Inventory } from './components/Inventory'
import { Finance } from './components/Finance'
import { Inbox } from './components/Inbox'
import { Marketing } from './components/Marketing'
import { Kanban } from './components/Kanban'
import { Collab } from './components/Collab'
import { EventBus } from './components/EventBus'
import { SettingsView } from './components/SettingsView'
import { TeamView } from './components/TeamView'
import { ThemeToggle } from './components/ThemeToggle'
import { ROLE_LABELS } from './lib/permissions'

export type View =
  | 'digest'
  | 'inventory'
  | 'finance'
  | 'inbox'
  | 'marketing'
  | 'rnd'
  | 'collab'
  | 'events'
  | 'team'
  | 'settings'

export interface Nav {
  view: View
  focusId?: string
}

const NAV_ITEMS: { view: View; label: string; icon: string; group: string }[] = [
  { view: 'digest', label: 'Daily Digest', icon: '☀️', group: 'Surfaces' },
  { view: 'inventory', label: 'Inventory & Procurement', icon: '📦', group: 'Modules' },
  { view: 'finance', label: 'Finance', icon: '💰', group: 'Modules' },
  { view: 'inbox', label: 'Unified Inbox', icon: '💬', group: 'Modules' },
  { view: 'marketing', label: 'Marketing', icon: '📣', group: 'Modules' },
  { view: 'rnd', label: 'R&D Kanban', icon: '🧪', group: 'Modules' },
  { view: 'collab', label: 'Internal Collab', icon: '🎫', group: 'Modules' },
  { view: 'events', label: 'Event Bus', icon: '⚡', group: 'System' },
  { view: 'team', label: 'Team & permissions', icon: '👥', group: 'System' },
  { view: 'settings', label: 'AI Settings', icon: '⚙️', group: 'System' },
]

export default function App({
  auth,
  mode,
  onDisconnect,
}: {
  auth: AuthSession | null
  mode: 'demo' | 'live'
  onDisconnect: () => void
}) {
  const { state, dispatch, loading, role } = useStore()
  const [nav, setNav] = useState<Nav>({ view: 'digest' })

  useEffect(() => {
    if (!state.toast) return
    const t = setTimeout(() => dispatch({ type: 'SET_TOAST', message: null }), 4200)
    return () => clearTimeout(t)
  }, [state.toast, dispatch])

  const navigate = (view: View, focusId?: string) => setNav({ view, focusId })

  const openTicketCount = state.tickets.filter((t) => t.status !== 'resolved').length
  const openConvCount = state.conversations.filter((c) => c.status === 'open').length

  const badgeFor = (view: View): number => {
    if (view === 'inbox') return openConvCount
    if (view === 'collab') return openTicketCount
    return 0
  }

  let content
  switch (nav.view) {
    case 'digest': content = <Digest navigate={navigate} />; break
    case 'inventory': content = <Inventory />; break
    case 'finance': content = <Finance />; break
    case 'inbox': content = <Inbox focusId={nav.focusId} />; break
    case 'marketing': content = <Marketing />; break
    case 'rnd': content = <Kanban focusId={nav.focusId} />; break
    case 'collab': content = <Collab focusId={nav.focusId} />; break
    case 'events': content = <EventBus />; break
    case 'team': content = <TeamView />; break
    case 'settings': content = <SettingsView />; break
  }

  const groups = ['Surfaces', 'Modules', 'System']

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-60 border-r border-line bg-surface">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">L</div>
          <div>
            <div className="text-sm font-semibold leading-tight">LightsOff</div>
            <div className="text-[11px] text-ink-faint">AI operator · prototype</div>
          </div>
        </div>
        <nav className="px-3 pb-44">
          {groups.map((group) => (
            <div key={group} className="mb-3">
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{group}</div>
              {NAV_ITEMS.filter((i) => i.group === group).map((item) => {
                const active = nav.view === item.view
                const badge = badgeFor(item.view)
                return (
                  <button
                    key={item.view}
                    onClick={() => navigate(item.view)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors cursor-pointer ${
                      active
                        ? 'bg-highlight font-medium text-highlight-fg'
                        : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                    }`}
                  >
                    <span className="text-sm">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {badge > 0 && (
                      <span className="rounded-full bg-rose-100 px-1.5 text-[10px] font-semibold text-rose-600">{badge}</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t border-line-subtle px-3 py-3">
          <ThemeToggle compact />
          <div className="mt-2 px-2 text-[11px] text-ink-faint">
            {auth?.displayName ?? (mode === 'demo' ? 'Alex Chen' : 'User')}
            {' · '}
            <span className="font-medium text-ink-muted">{ROLE_LABELS[role]}</span>
          </div>
          <div className="mt-0.5 px-2 text-[11px] text-ink-faint">
            Tenant: <span className="font-medium text-ink-muted">{auth?.tenantName ?? 'demo (in-memory)'}</span>
          </div>
          <div className={`mt-0.5 px-2 text-[11px] ${mode === 'live' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
            ● {mode === 'live' ? (loading ? 'Syncing with API…' : 'Live — Inventory + Finance from DB') : 'Demo mode — in-memory seed data'}
          </div>
          {mode === 'live' && (
            <button onClick={onDisconnect} className="mt-1 px-2 text-[11px] text-ink-faint underline cursor-pointer hover:text-ink-muted">
              Disconnect
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="pl-60">
        <CaptureBar />
        <main className="mx-auto max-w-5xl px-8 py-6">{content}</main>
      </div>

      {/* Toast */}
      {state.toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-highlight px-4 py-2.5 text-sm text-highlight-fg shadow-lg ring-1 ring-accent/30">
          {state.toast}
        </div>
      )}
    </div>
  )
}
