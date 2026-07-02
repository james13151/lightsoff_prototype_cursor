import { useStore } from '../store'
import { Badge, Card, SectionTitle, timeAgo } from './ui'

const PO_STATUS_TONE: Record<string, string> = {
  draft: 'slate', sent: 'sky', partially_received: 'amber', received: 'emerald', closed: 'slate',
}

export function Inventory() {
  const { state } = useStore()
  const vendorName = (id: string) => state.vendors.find((v) => v.id === id)?.name ?? '—'
  const productById = (id: string | null) => state.products.find((p) => p.id === id)

  return (
    <div className="space-y-8">
      <div>
        <SectionTitle sub="Brand OS is the system of record for stock — every movement below is pushed to Shopify, not pulled from it.">
          Stock levels
        </SectionTitle>
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5 font-medium">SKU</th>
                <th className="px-4 py-2.5 font-medium">Product</th>
                <th className="px-4 py-2.5 font-medium text-right">On hand</th>
                <th className="px-4 py-2.5 font-medium text-right">Reorder pt</th>
                <th className="px-4 py-2.5 font-medium text-right">Velocity/day</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {state.products.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{p.sku}</td>
                  <td className="px-4 py-2.5">{p.name}</td>
                  <td className={`px-4 py-2.5 text-right font-medium ${p.stock === 0 ? 'text-rose-600' : p.stock <= p.reorderPoint ? 'text-amber-600' : ''}`}>
                    {p.stock}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{p.reorderPoint}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{p.salesVelocityPerDay}</td>
                  <td className="px-4 py-2.5">
                    {p.stock === 0 ? (
                      <Badge tone="rose">out of stock</Badge>
                    ) : p.stock <= p.reorderPoint ? (
                      <Badge tone="amber">below reorder point</Badge>
                    ) : (
                      <Badge tone="emerald">healthy</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div>
        <SectionTitle sub="POs drafted by AI capture or AI reorder suggestions carry their origin — nothing enters the system untagged.">
          Purchase orders
        </SectionTitle>
        <div className="space-y-2.5">
          {state.purchaseOrders.map((po) => (
            <Card key={po.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{po.id}</span>
                <Badge tone={PO_STATUS_TONE[po.status]}>{po.status.replace(/_/g, ' ')}</Badge>
                <Badge tone={po.source === 'manual' ? 'slate' : 'indigo'}>
                  {po.source === 'ai_capture' ? '✦ from AI capture' : po.source === 'ai_reorder' ? '✦ AI reorder suggestion' : 'manual'}
                </Badge>
                <span className="ml-auto text-xs text-slate-400">{vendorName(po.vendorId)} · {timeAgo(po.createdAt)}</span>
              </div>
              <div className="mt-2 text-sm text-slate-600">
                {po.lines.map((l) => {
                  const p = productById(l.productId)
                  return (
                    <div key={l.productId} className="flex justify-between border-t border-slate-50 py-1 first:border-0">
                      <span>{l.qty}× {p?.name ?? l.productId}</span>
                      <span className="text-slate-400">${(l.qty * l.unitCost).toFixed(2)}</span>
                    </div>
                  )
                })}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle sub="Receipts of type=sample skip commercial stock and auto-create R&D cards. Discrepancies vs the PO are flagged, never silently accepted.">
          Receipts
        </SectionTitle>
        <div className="space-y-2.5">
          {state.receipts.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{r.id}</span>
                <Badge tone={r.type === 'sample' ? 'indigo' : 'sky'}>{r.type}</Badge>
                {r.poId && <Badge>matched to {r.poId}</Badge>}
                <span className="ml-auto text-xs text-slate-400">{vendorName(r.vendorId)} · {timeAgo(r.createdAt)}</span>
              </div>
              <div className="mt-1.5 text-sm text-slate-600">
                {r.lines.map((l, i) => (
                  <div key={i}>+{l.qty} — {l.description}</div>
                ))}
              </div>
              {r.discrepancy && (
                <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  ⚠ {r.discrepancy}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle sub="Append-only source of truth for stock. Shopify sales flow in via webhook; everything else originates here and is pushed out.">
          Inventory ledger
        </SectionTitle>
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5 font-medium">SKU</th>
                <th className="px-4 py-2.5 font-medium text-right">Δ qty</th>
                <th className="px-4 py-2.5 font-medium">Reason</th>
                <th className="px-4 py-2.5 font-medium">Reference</th>
                <th className="px-4 py-2.5 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {state.ledger.map((e) => {
                const p = productById(e.productId)
                return (
                  <tr key={e.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{p?.sku ?? e.productId}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${e.qtyDelta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {e.qtyDelta > 0 ? `+${e.qtyDelta}` : e.qtyDelta}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{e.reason.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{e.refId}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{timeAgo(e.at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
