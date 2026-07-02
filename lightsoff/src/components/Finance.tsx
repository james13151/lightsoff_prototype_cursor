import { useStore } from '../store'
import { cashPosition } from '../ai/digest'
import { Badge, Button, Card, ConfidenceBadge, SectionTitle, Stat, timeAgo } from './ui'

const SOURCE_LABEL: Record<string, string> = {
  inventory_ap: 'Inventory AP event',
  ad_spend: 'Marketing ad spend',
  shopify_revenue: 'Shopify payout',
  expense_claim: 'Expense claim',
  manual: 'Manual entry',
}

export function Finance() {
  const { state, dispatch } = useStore()
  const { cash, revenue30d, expenses30d } = cashPosition(state)
  const vendorName = (id: string) => state.vendors.find((v) => v.id === id)?.name ?? '—'
  const unpaidTotal = state.bills.filter((b) => b.status === 'unpaid').reduce((s, b) => s + b.amount, 0)

  return (
    <div className="space-y-8">
      <div>
        <SectionTitle sub="Computed live from the journal — no separate reporting layer, no shadow ledgers in other modules.">
          Cash & P&L
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Cash" value={`$${cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} tone="text-emerald-600" />
          <Stat label="Revenue (30d)" value={`$${revenue30d.toLocaleString()}`} />
          <Stat label="Expenses (30d)" value={`$${expenses30d.toLocaleString()}`} />
          <Stat label="AP outstanding" value={`$${unpaidTotal.toLocaleString()}`} sub={`${state.bills.filter((b) => b.status === 'unpaid').length} unpaid bills`} tone="text-amber-600" />
        </div>
      </div>

      <div>
        <SectionTitle sub="Auto-created from Inventory's PO/receipt flow. Anomalies (new vendor, unusual amount) are held — recurring vendors auto-post.">
          Vendor bills
        </SectionTitle>
        <div className="space-y-2.5">
          {state.bills.map((b) => {
            const days = Math.ceil((new Date(b.dueDate).getTime() - Date.now()) / 86400000)
            return (
              <Card key={b.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{b.id}</span>
                  <Badge tone={b.status === 'paid' ? 'emerald' : days <= 3 ? 'rose' : 'amber'}>
                    {b.status === 'paid' ? 'paid' : `due ${days >= 0 ? `in ${days}d` : `${-days}d ago`}`}
                  </Badge>
                  <span className="text-sm text-slate-600">{vendorName(b.vendorId)} — {b.memo}</span>
                  <span className="ml-auto text-sm font-semibold">${b.amount.toFixed(2)}</span>
                  {b.status === 'unpaid' && !b.anomaly && (
                    <Button variant="secondary" onClick={() => dispatch({ type: 'PAY_BILL', billId: b.id })}>Pay</Button>
                  )}
                </div>
                {b.anomaly && (
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-2">
                    <span className="text-sm text-rose-700">⚠ {b.anomaly}</span>
                    <Button variant="secondary" onClick={() => dispatch({ type: 'APPROVE_BILL_ANOMALY', billId: b.id })}>
                      Reviewed — approve
                    </Button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      </div>

      <div>
        <SectionTitle sub="AI extracts vendor, amount, and category from receipt photos. Above your confidence threshold they auto-apply with an undo window; below it they route to a Collab approval ticket.">
          Expense claims (petty cash)
        </SectionTitle>
        <div className="space-y-2.5">
          {state.claims.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{c.id}</span>
                <Badge tone={c.status === 'approved' ? 'emerald' : c.status === 'rejected' ? 'rose' : 'amber'}>{c.status.replace(/_/g, ' ')}</Badge>
                <span className="text-sm text-slate-600">{c.vendorName} → {c.category}</span>
                <ConfidenceBadge value={c.confidence} />
                <span className="ml-auto text-sm font-semibold">${c.amount.toFixed(2)}</span>
                {c.status === 'pending_review' && (
                  <>
                    <Button variant="secondary" onClick={() => dispatch({ type: 'APPROVE_CLAIM', claimId: c.id })}>Approve</Button>
                    <Button variant="ghost" onClick={() => dispatch({ type: 'REJECT_CLAIM', claimId: c.id })}>Reject</Button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle sub="Double-entry, auto-posted from other modules' events. This is the single ledger every cost and revenue event flows into.">
          Journal
        </SectionTitle>
        <div className="space-y-2.5">
          {state.journal.map((je) => (
            <Card key={je.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{je.id}</span>
                <Badge tone="slate">{SOURCE_LABEL[je.source]}</Badge>
                {je.autoPosted && <Badge tone="indigo">✦ auto-posted</Badge>}
                <span className="text-sm text-slate-600">{je.memo}</span>
                <span className="ml-auto text-xs text-slate-400">{timeAgo(je.at)}</span>
              </div>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {je.lines.map((l, i) => (
                    <tr key={i} className="border-t border-slate-50">
                      <td className="py-1 text-slate-600">{l.account}</td>
                      <td className="py-1 text-right font-mono text-xs text-slate-500">{l.debit > 0 ? `$${l.debit.toFixed(2)}` : ''}</td>
                      <td className="py-1 text-right font-mono text-xs text-slate-400">{l.credit > 0 ? `$${l.credit.toFixed(2)}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
