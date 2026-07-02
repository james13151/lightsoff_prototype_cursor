import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { Badge, Button, Card, SectionTitle, timeAgo } from './ui'

const LINK_ICON: Record<string, string> = {
  po: '📦', bill: '💰', campaign: '📣', card: '🧪', conversation: '💬', claim: '🧾',
}

export function Collab({ focusId }: { focusId?: string }) {
  const { state, dispatch } = useStore()
  const focusRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusId])

  const ordered = [...state.tickets].sort((a, b) => {
    const rank = (t: typeof a) => (t.status === 'awaiting_user' ? 0 : t.status === 'open' ? 1 : 2)
    return rank(a) - rank(b)
  })

  const claimFor = (ticketId: string) => {
    const t = state.tickets.find((x) => x.id === ticketId)
    const link = t?.links.find((l) => l.refType === 'claim')
    return link ? state.claims.find((c) => c.id === link.refId) : undefined
  }

  return (
    <div>
      <SectionTitle sub="The connective tissue — every ticket can link to any object in any module (a PO, a bill, a campaign, a kanban card). Approvals from Finance and blocker escalations from R&D route through here.">
        Internal Collab
      </SectionTitle>
      <div className="space-y-2.5">
        {ordered.map((t) => {
          const isFocus = t.id === focusId
          const claim = claimFor(t.id)
          const showClaimActions = claim && claim.status === 'pending_review' && t.status !== 'resolved'
          return (
            <div key={t.id} ref={isFocus ? focusRef : undefined}>
              <Card className={`p-4 ${isFocus ? 'ring-2 ring-indigo-300' : ''} ${t.status === 'resolved' ? 'opacity-60' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{t.id}</span>
                  <Badge tone={t.status === 'awaiting_user' ? 'rose' : t.status === 'open' ? 'amber' : 'emerald'}>
                    {t.status.replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-sm font-medium">{t.title}</span>
                  <span className="ml-auto text-xs text-slate-400">{timeAgo(t.createdAt)}</span>
                </div>
                <p className="mt-1.5 text-sm text-slate-500">{t.body}</p>
                {t.links.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {t.links.map((l) => (
                      <span key={l.refId} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                        {LINK_ICON[l.refType]} {l.label}
                      </span>
                    ))}
                  </div>
                )}
                {t.status !== 'resolved' && (
                  <div className="mt-3 flex items-center gap-2">
                    {showClaimActions ? (
                      <>
                        <Button onClick={() => dispatch({ type: 'APPROVE_CLAIM', claimId: claim.id })}>
                          Approve claim (${claim.amount.toFixed(2)})
                        </Button>
                        <Button variant="ghost" onClick={() => dispatch({ type: 'REJECT_CLAIM', claimId: claim.id })}>Reject claim</Button>
                      </>
                    ) : (
                      <Button variant="secondary" onClick={() => dispatch({ type: 'RESOLVE_TICKET', ticketId: t.id })}>
                        Mark resolved
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            </div>
          )
        })}
      </div>
    </div>
  )
}
