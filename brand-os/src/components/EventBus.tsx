import { useStore } from '../store'
import { Badge, Card, SectionTitle, timeAgo } from './ui'

const MODULE_TONE: Record<string, string> = {
  Inventory: 'sky', Finance: 'emerald', Marketing: 'amber', Inbox: 'rose', 'R&D': 'indigo', Collab: 'violet',
}

export function EventBus() {
  const { state } = useStore()
  return (
    <div>
      <SectionTitle sub="The append-only, tenant-scoped event bus every module publishes to and subscribes from. The daily digest and all cross-module automation (OOS ad guard, sample→kanban, AP→journal) are built on top of it.">
        Event Bus
      </SectionTitle>
      <Card>
        <div className="divide-y divide-slate-50">
          {state.events.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-3">
              <Badge tone={MODULE_TONE[e.module] ?? 'slate'}>{e.module}</Badge>
              <code className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{e.type}</code>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-600" title={e.summary}>{e.summary}</span>
              <span className="shrink-0 text-xs text-slate-400">{timeAgo(e.at)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
