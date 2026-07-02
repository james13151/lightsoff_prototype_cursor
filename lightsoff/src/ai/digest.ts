import type { AppState } from '../store'

export interface DigestItem {
  key: string
  module: string
  moduleColor: string
  priority: 1 | 2 | 3 // 1 = needs you now
  title: string
  detail: string
  action?: { label: string; kind: DigestActionKind; refId: string; extra?: number }
  secondaryAction?: { label: string; kind: DigestActionKind; refId: string }
}

export type DigestActionKind =
  | 'reorder'
  | 'pay_bill'
  | 'review_bill'
  | 'approve_claim'
  | 'open_conversation'
  | 'resume_campaign'
  | 'open_card'
  | 'open_ticket'

export function buildDigest(state: AppState): DigestItem[] {
  const items: DigestItem[] = []
  const vendorName = (id: string) => state.vendors.find((v) => v.id === id)?.name ?? 'Vendor'

  // Urgent negative-sentiment conversations
  for (const c of state.conversations) {
    if (c.status === 'open' && c.urgent) {
      items.push({
        key: `conv-${c.id}`,
        module: 'Inbox',
        moduleColor: 'bg-rose-500',
        priority: 1,
        title: `Escalation: ${c.customerName} — "${c.subject}"`,
        detail: `Negative sentiment + dispute risk detected. AI draft ready at ${(c.aiDraftConfidence * 100).toFixed(0)}% confidence — held for your review because stakes are high.`,
        action: { label: 'Review draft reply', kind: 'open_conversation', refId: c.id },
      })
    }
  }

  // Anomalous bills
  for (const b of state.bills) {
    if (b.status === 'unpaid' && b.anomaly) {
      items.push({
        key: `anomaly-${b.id}`,
        module: 'Finance',
        moduleColor: 'bg-emerald-500',
        priority: 1,
        title: `Anomaly held: ${b.id} from ${vendorName(b.vendorId)} — $${b.amount.toFixed(2)}`,
        detail: b.anomaly,
        action: { label: 'Approve after review', kind: 'review_bill', refId: b.id },
      })
    }
  }

  // Tickets awaiting user
  for (const t of state.tickets) {
    if (t.status === 'awaiting_user') {
      items.push({
        key: `ticket-${t.id}`,
        module: 'Collab',
        moduleColor: 'bg-violet-500',
        priority: 1,
        title: t.title,
        detail: t.body,
        action: { label: 'Open ticket', kind: 'open_ticket', refId: t.id },
      })
    }
  }

  // Low / out of stock with reorder suggestion
  for (const p of state.products) {
    if (p.stock > p.reorderPoint) continue
    const hasOpenPO = state.purchaseOrders.some(
      (po) => (po.status === 'sent' || po.status === 'draft') && po.lines.some((l) => l.productId === p.id),
    )
    const daysCover = p.salesVelocityPerDay > 0 ? Math.floor(p.stock / p.salesVelocityPerDay) : 99
    const suggestedQty = Math.ceil(p.salesVelocityPerDay * 30)
    items.push({
      key: `stock-${p.id}`,
      module: 'Inventory',
      moduleColor: 'bg-sky-500',
      priority: p.stock === 0 ? 1 : 2,
      title: p.stock === 0 ? `${p.sku} is out of stock` : `${p.sku} low: ${p.stock} left (~${daysCover} days of cover)`,
      detail: hasOpenPO
        ? `An open PO already covers this SKU — restock inbound. Selling ${p.salesVelocityPerDay}/day.`
        : `Selling ${p.salesVelocityPerDay}/day with a ${state.vendors[0].leadTimeDays}-day vendor lead time. AI suggests reordering ${suggestedQty} units (30-day cover).`,
      action: hasOpenPO ? undefined : { label: `Draft reorder PO (${suggestedQty})`, kind: 'reorder', refId: p.id, extra: suggestedQty },
    })
  }

  // Bills due within 7 days
  for (const b of state.bills) {
    if (b.status !== 'unpaid' || b.anomaly) continue
    const days = Math.ceil((new Date(b.dueDate).getTime() - Date.now()) / 86400000)
    if (days <= 7) {
      items.push({
        key: `bill-${b.id}`,
        module: 'Finance',
        moduleColor: 'bg-emerald-500',
        priority: 2,
        title: `${b.id} due in ${days} day${days === 1 ? '' : 's'} — $${b.amount.toFixed(2)} to ${vendorName(b.vendorId)}`,
        detail: `${b.memo}. Paying will auto-post the journal entry (AP → Cash).`,
        action: { label: 'Pay now', kind: 'pay_bill', refId: b.id },
      })
    }
  }

  // Unanswered conversations (non-urgent)
  for (const c of state.conversations) {
    if (c.status === 'open' && !c.urgent && c.aiDraft) {
      items.push({
        key: `conv-${c.id}`,
        module: 'Inbox',
        moduleColor: 'bg-rose-500',
        priority: 2,
        title: `${c.customerName} on ${c.channel}: "${c.subject}"`,
        detail: `AI drafted a reply using live stock and reorder ETA as context (${(c.aiDraftConfidence * 100).toFixed(0)}% confidence).`,
        action: { label: 'Review & send', kind: 'open_conversation', refId: c.id },
      })
    }
  }

  // OOS-paused campaigns where SKU is restocked
  for (const camp of state.campaigns) {
    if (camp.status !== 'paused_oos' || !camp.linkedSku) continue
    const sku = state.products.find((p) => p.sku === camp.linkedSku)
    if (sku && sku.stock > 0) {
      items.push({
        key: `camp-${camp.id}`,
        module: 'Marketing',
        moduleColor: 'bg-amber-500',
        priority: 2,
        title: `"${camp.name}" can resume — ${camp.linkedSku} is back in stock (${sku.stock} units)`,
        detail: `AI paused this campaign when the SKU went out of stock. ROAS before pause: ${(camp.revenue30d / camp.spend30d).toFixed(1)}x. Resuming needs your approval (spend change).`,
        action: { label: 'Approve resume', kind: 'resume_campaign', refId: camp.id },
      })
    } else {
      items.push({
        key: `camp-${camp.id}`,
        module: 'Marketing',
        moduleColor: 'bg-amber-500',
        priority: 3,
        title: `"${camp.name}" paused — ${camp.linkedSku} still out of stock`,
        detail: 'OOS ad guard is holding this campaign. It will surface for resume approval the moment stock lands.',
      })
    }
  }

  // Aging R&D cards
  for (const card of state.cards) {
    if (card.stage === 'in_review' && card.daysInStage >= 7) {
      items.push({
        key: `card-${card.id}`,
        module: 'R&D',
        moduleColor: 'bg-indigo-500',
        priority: 3,
        title: `Sample aging: "${card.title}" in review ${card.daysInStage} days`,
        detail: card.note || 'Needs a go/no-go call.',
        action: { label: 'Open card', kind: 'open_card', refId: card.id },
      })
    }
    if (card.blockers.length > 0) {
      items.push({
        key: `blocked-${card.id}`,
        module: 'R&D',
        moduleColor: 'bg-indigo-500',
        priority: 3,
        title: `Blocked: "${card.title}"`,
        detail: card.blockers.join('; '),
        action: { label: 'Open card', kind: 'open_card', refId: card.id },
      })
    }
  }

  // New samples received
  for (const card of state.cards) {
    if (card.stage === 'received' && card.daysInStage <= 2) {
      items.push({
        key: `sample-${card.id}`,
        module: 'R&D',
        moduleColor: 'bg-indigo-500',
        priority: 2,
        title: `Sample arrived: "${card.title}"`,
        detail: `${card.note} Move to review when you've had a look.`,
        action: { label: 'Start review', kind: 'open_card', refId: card.id },
      })
    }
  }

  return items
    .filter((i) => !state.dismissedDigest.includes(i.key))
    .sort((a, b) => a.priority - b.priority)
}

export function cashPosition(state: AppState): { cash: number; revenue30d: number; expenses30d: number } {
  let cash = 12000 // opening balance for prototype
  let revenue = 0
  let expenses = 0
  for (const je of state.journal) {
    for (const l of je.lines) {
      if (l.account === 'Cash') cash += l.debit - l.credit
      if (l.account === 'Sales Revenue') revenue += l.credit
      if (l.account !== 'Cash' && l.account !== 'Accounts Payable' && l.account !== 'Sales Revenue' && l.account !== 'Petty Cash') {
        expenses += l.debit
      }
    }
  }
  return { cash, revenue30d: revenue, expenses30d: expenses }
}
