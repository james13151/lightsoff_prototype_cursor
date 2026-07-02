import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import type { CardStage } from '../types'
import { Badge, Button, Card, SectionTitle } from './ui'

const STAGES: { stage: CardStage; label: string }[] = [
  { stage: 'requested', label: 'Requested' },
  { stage: 'received', label: 'Received' },
  { stage: 'in_review', label: 'In review' },
  { stage: 'approved', label: 'Approved' },
  { stage: 'specd_as_sku', label: "Spec'd as SKU" },
]

const NEXT_STAGE: Partial<Record<CardStage, CardStage>> = {
  requested: 'received',
  received: 'in_review',
  in_review: 'approved',
  approved: 'specd_as_sku',
}

export function Kanban({ focusId }: { focusId?: string }) {
  const { state, dispatch } = useStore()
  const focusRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusId])

  const vendorName = (id: string | null) => state.vendors.find((v) => v.id === id)?.name

  return (
    <div>
      <SectionTitle sub="Sample-to-SKU pipeline. Cards are auto-created when Inventory logs a receipt with type=sample — there is no separate sample-tracking system to maintain.">
        R&D Kanban
      </SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {STAGES.map(({ stage, label }) => {
          const cards = state.cards.filter((c) => c.stage === stage)
          return (
            <div key={stage} className="rounded-xl bg-slate-100/70 p-2.5">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
                <span className="text-xs text-slate-400">{cards.length}</span>
              </div>
              <div className="space-y-2">
                {cards.map((card) => {
                  const next = NEXT_STAGE[card.stage]
                  const isFocus = card.id === focusId
                  return (
                    <div key={card.id} ref={isFocus ? focusRef : undefined}>
                      <Card className={`p-3 ${isFocus ? 'ring-2 ring-indigo-300' : ''}`}>
                        <div className="text-sm font-medium leading-snug">{card.title}</div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {vendorName(card.vendorId) && <Badge>{vendorName(card.vendorId)}</Badge>}
                          {card.receiptId && <Badge tone="indigo">✦ from {card.receiptId}</Badge>}
                          {card.daysInStage >= 7 && <Badge tone="amber">{card.daysInStage}d in stage</Badge>}
                        </div>
                        {card.blockers.map((b, i) => (
                          <div key={i} className="mt-1.5 rounded-md bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
                            ⛔ {b}
                          </div>
                        ))}
                        {card.note && <p className="mt-1.5 text-[11px] text-slate-400">{card.note}</p>}
                        {next && (
                          <div className="mt-2">
                            <Button
                              variant="secondary"
                              className="w-full !py-1 text-xs"
                              onClick={() => dispatch({ type: 'ADVANCE_CARD', cardId: card.id, stage: next })}
                            >
                              → {STAGES.find((s) => s.stage === next)?.label}
                            </Button>
                          </div>
                        )}
                      </Card>
                    </div>
                  )
                })}
                {cards.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] text-slate-400">
                    empty
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
