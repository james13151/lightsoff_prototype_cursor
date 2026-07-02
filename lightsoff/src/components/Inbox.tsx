import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { Badge, Button, Card, ConfidenceBadge, SectionTitle, timeAgo } from './ui'

const CHANNEL_ICON: Record<string, string> = {
  instagram: '📸', whatsapp: '🟢', email: '✉️', facebook: '👤',
}

export function Inbox({ focusId }: { focusId?: string }) {
  const { state, dispatch } = useStore()
  const [edits, setEdits] = useState<Record<string, string>>({})
  const focusRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusId])

  const ordered = [...state.conversations].sort((a, b) => {
    const rank = (c: typeof a) => (c.status === 'open' ? (c.urgent ? 0 : 1) : 2)
    return rank(a) - rank(b)
  })

  return (
    <div>
      <SectionTitle sub="One queue across Instagram, WhatsApp, Facebook, and email. AI triages by sentiment/urgency and drafts replies grounded in live order and stock data.">
        Unified Inbox
      </SectionTitle>
      <div className="space-y-3">
        {ordered.map((c) => {
          const draftText = edits[c.id] ?? c.aiDraft ?? ''
          const isFocus = c.id === focusId
          return (
            <div key={c.id} ref={isFocus ? focusRef : undefined}>
              <Card className={`p-4 ${isFocus ? 'ring-2 ring-indigo-300' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base">{CHANNEL_ICON[c.channel]}</span>
                  <span className="text-sm font-semibold">{c.customerName}</span>
                  <span className="text-sm text-slate-500">— {c.subject}</span>
                  {c.urgent && <Badge tone="rose">urgent · negative sentiment</Badge>}
                  <Badge tone={c.status === 'open' ? 'amber' : 'emerald'}>{c.status}</Badge>
                  <span className="ml-auto text-xs text-slate-400">{timeAgo(c.messages[c.messages.length - 1].at)}</span>
                </div>

                <div className="mt-3 space-y-2">
                  {c.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[85%] rounded-xl px-3.5 py-2 text-sm ${
                        m.from === 'customer' ? 'bg-slate-100 text-slate-800' : 'ml-auto bg-slate-900 text-white'
                      }`}
                    >
                      {m.body}
                    </div>
                  ))}
                </div>

                {c.aiDraft && c.status === 'open' && (
                  <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="indigo">✦ AI draft</Badge>
                      <ConfidenceBadge value={c.aiDraftConfidence} threshold={state.settings.confidenceThreshold} />
                    </div>
                    {c.aiContext.length > 0 && (
                      <div className="mt-2 space-y-0.5">
                        {c.aiContext.map((ctx, i) => (
                          <div key={i} className="text-[11px] text-slate-500">◦ {ctx}</div>
                        ))}
                      </div>
                    )}
                    <textarea
                      value={draftText}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      rows={3}
                      className="mt-2 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <Button onClick={() => dispatch({ type: 'APPROVE_REPLY', convId: c.id, body: draftText })}>
                        {edits[c.id] && edits[c.id] !== c.aiDraft ? 'Send edited reply' : 'Approve & send'}
                      </Button>
                      <span className="text-[11px] text-slate-400">
                        {c.urgent ? 'High-stakes conversation — always requires your approval regardless of confidence.' : 'Edit freely — your correction trains the drafting model.'}
                      </span>
                    </div>
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
