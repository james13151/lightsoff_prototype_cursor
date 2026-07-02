import { useStore } from '../store'
import { buildDigest, cashPosition, type DigestItem } from '../ai/digest'
import { Badge, Button, Card, SectionTitle, Stat } from './ui'
import type { View } from '../App'

const PRIORITY_LABEL: Record<number, { label: string; tone: string }> = {
  1: { label: 'Needs you now', tone: 'rose' },
  2: { label: 'Today', tone: 'amber' },
  3: { label: 'Worth knowing', tone: 'slate' },
}

export function Digest({ navigate }: { navigate: (view: View, focusId?: string) => void }) {
  const { state, dispatch } = useStore()
  const items = buildDigest(state)
  const { cash, revenue30d } = cashPosition(state)

  const runAction = (item: DigestItem) => {
    const a = item.action
    if (!a) return
    switch (a.kind) {
      case 'reorder':
        dispatch({ type: 'CREATE_REORDER_PO', productId: a.refId, qty: a.extra ?? 30 })
        dispatch({ type: 'DISMISS_DIGEST', key: item.key })
        break
      case 'pay_bill':
        dispatch({ type: 'PAY_BILL', billId: a.refId })
        break
      case 'review_bill':
        dispatch({ type: 'APPROVE_BILL_ANOMALY', billId: a.refId })
        break
      case 'resume_campaign':
        dispatch({ type: 'RESUME_CAMPAIGN', campaignId: a.refId })
        break
      case 'open_conversation':
        navigate('inbox', a.refId)
        break
      case 'open_card':
        navigate('rnd', a.refId)
        break
      case 'open_ticket':
        navigate('collab', a.refId)
        break
      case 'approve_claim':
        dispatch({ type: 'APPROVE_CLAIM', claimId: a.refId })
        break
    }
  }

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'
  const needsYou = items.filter((i) => i.priority === 1).length

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{greeting}.</h1>
        <p className="mt-1 text-sm text-slate-500">
          One feed across all six modules. {needsYou > 0 ? `${needsYou} item${needsYou === 1 ? '' : 's'} need${needsYou === 1 ? 's' : ''} a decision from you.` : 'Nothing urgent — AI is handling the rest.'}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cash position" value={`$${cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub="live from journal" tone="text-emerald-600" />
        <Stat label="Revenue (30d)" value={`$${revenue30d.toLocaleString()}`} sub="Shopify auto-posted" />
        <Stat label="Open conversations" value={String(state.conversations.filter((c) => c.status === 'open').length)} sub="AI drafts waiting" />
        <Stat
          label="SKUs at/below reorder"
          value={String(state.products.filter((p) => p.stock <= p.reorderPoint).length)}
          sub="of 6 tracked SKUs"
          tone="text-amber-600"
        />
      </div>

      <SectionTitle sub="Generated from the event bus each morning — approve, correct, or drill down.">
        Today's digest
      </SectionTitle>

      {items.length === 0 && (
        <Card className="p-8 text-center text-sm text-slate-500">
          All clear — everything actionable has been handled. Check the Event Bus for what AI did on its own.
        </Card>
      )}

      <div className="space-y-2.5">
        {items.map((item) => {
          const pr = PRIORITY_LABEL[item.priority]
          return (
            <Card key={item.key} className="p-4">
              <div className="flex items-start gap-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.moduleColor}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{item.title}</span>
                    <Badge tone={pr.tone}>{pr.label}</Badge>
                    <Badge>{item.module}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {item.action && (
                    <Button variant="secondary" onClick={() => runAction(item)}>
                      {item.action.label}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => dispatch({ type: 'DISMISS_DIGEST', key: item.key })}>
                    ✕
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
