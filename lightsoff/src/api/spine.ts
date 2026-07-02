import { apiFetch } from './client'
import type {
  Product, Vendor, PurchaseOrder, Receipt, InventoryLedgerEntry, VendorBill,
  JournalEntry, ExpenseClaim, BusEvent, CaptureDraft,
} from '../types'

export interface FinanceSummary {
  cash: number
  petty_cash: number
  accounts_payable: number
  revenue: number
  expenses: number
  net_profit: number
}

export interface SpineSnapshot {
  vendors: Vendor[]
  products: Product[]
  purchaseOrders: PurchaseOrder[]
  receipts: Receipt[]
  ledger: InventoryLedgerEntry[]
  bills: VendorBill[]
  journal: JournalEntry[]
  claims: ExpenseClaim[]
  events: BusEvent[]
  financeSummary: FinanceSummary
}

const CATEGORY_TO_CODE: Record<string, string> = {
  'Shipping & Freight': '6100',
  Software: '6200',
  'Meals & Entertainment': '6300',
  'General Expense': '6900',
}

function eventModule(type: string): string {
  const prefix = type.split('.')[0]
  const map: Record<string, string> = {
    vendor: 'Inventory', po: 'Inventory', inventory: 'Inventory',
    bill: 'Finance', payment: 'Finance', journal: 'Finance', claim: 'Finance',
    integration: 'System',
  }
  return map[prefix] ?? 'System'
}

function eventSummary(type: string, payload: Record<string, unknown>): string {
  if (type === 'inventory.received') return `Receipt ${String(payload.receipt_id ?? '').slice(0, 8)} logged`
  if (type === 'inventory.discrepancy_flagged') {
    return `Discrepancy: received ${payload.received_total} of ${payload.ordered} ordered`
  }
  if (type === 'bill.created') return `Bill created — $${Number(payload.amount).toFixed(2)}`
  if (type === 'bill.paid') return `Bill paid — $${Number(payload.amount).toFixed(2)}`
  if (type === 'claim.approved') return `Claim approved — $${Number(payload.amount).toFixed(2)}`
  if (type === 'journal.posted') return String(payload.memo ?? 'Journal entry posted')
  if (type === 'inventory.adjusted') {
    const delta = Number(payload.qty_delta)
    return `Stock adjusted ${delta > 0 ? '+' : ''}${delta}`
  }
  return type
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

export function adaptSpineData(raw: {
  vendors: Row[]
  products: Row[]
  stock: Row[]
  purchaseOrders: Row[]
  receipts: Row[]
  ledger: Row[]
  bills: Row[]
  journal: Row[]
  claims: Row[]
  events: Row[]
  financeSummary: FinanceSummary
}): SpineSnapshot {
  const stockByVariant = new Map<string, number>(raw.stock.map((s) => [s.variant_id, Number(s.on_hand)]))

  const products: Product[] = []
  for (const p of raw.products) {
    for (const v of p.variants ?? []) {
      products.push({
        id: v.id,
        sku: v.sku,
        name: p.title + (v.title ? ` (${v.title})` : ''),
        stock: stockByVariant.get(v.id) ?? 0,
        reorderPoint: v.reorder_point ?? 0,
        unitCost: Number(v.unit_cost ?? 0),
        price: Number(v.price ?? 0),
        salesVelocityPerDay: 0, // Shopify velocity pipe not wired yet
        shopifySynced: Boolean(p.shopify_product_id),
      })
    }
  }

  const vendors: Vendor[] = raw.vendors.map((v) => ({
    id: v.id,
    name: v.name,
    leadTimeDays: v.lead_time_days ?? 14,
    isRecurring: true,
  }))

  const purchaseOrders: PurchaseOrder[] = raw.purchaseOrders.map((po) => ({
    id: po.id,
    vendorId: po.vendor_id,
    status: po.status,
    source: po.source,
    createdAt: po.created_at,
    lines: (po.lines ?? []).map((l: Row) => ({
      productId: l.variant_id,
      qty: l.qty,
      unitCost: Number(l.unit_cost),
    })),
  }))

  const receipts: Receipt[] = raw.receipts.map((r) => ({
    id: r.id,
    poId: r.po_id,
    vendorId: r.vendor_id,
    type: r.type,
    createdAt: r.received_at ?? r.created_at,
    lines: (r.lines ?? []).map((l: Row) => ({
      productId: l.variant_id,
      description: l.description ?? products.find((p) => p.id === l.variant_id)?.name ?? '—',
      qty: l.qty,
    })),
    discrepancy: null, // surfaced via events in live mode
  }))

  const ledger: InventoryLedgerEntry[] = raw.ledger.map((e) => ({
    id: e.id,
    productId: e.variant_id,
    qtyDelta: e.qty_delta,
    reason: e.reason,
    refId: e.ref_id ?? '',
    at: e.created_at,
  }))

  const bills: VendorBill[] = raw.bills.map((b) => ({
    id: b.id,
    vendorId: b.vendor_id,
    amount: Number(b.amount),
    dueDate: b.due_date ?? b.issued_at,
    status: b.status === 'partially_paid' ? 'partially_paid' : b.status === 'paid' ? 'paid' : 'unpaid',
    memo: b.memo ?? b.bill_number ?? '',
    anomaly: null,
    amountPaid: Number(b.amount_paid ?? 0),
  }))

  const journal: JournalEntry[] = raw.journal.map((je) => ({
    id: je.id,
    memo: je.memo,
    source: je.source,
    at: je.posted_at,
    autoPosted: je.source !== 'manual',
    lines: (je.lines ?? []).map((l: Row) => ({
      account: l.account_name ?? l.account_code,
      debit: Number(l.debit),
      credit: Number(l.credit),
    })),
  }))

  const claims: ExpenseClaim[] = raw.claims.map((c) => ({
    id: c.id,
    vendorName: c.vendor_name,
    amount: Number(c.amount),
    category: c.category_name ?? c.category_code ?? 'Expense',
    date: c.claimed_at,
    status: c.status,
    confidence: Number(c.confidence ?? 0.8),
    source: c.source,
  }))

  const events: BusEvent[] = raw.events.map((e) => ({
    id: e.id,
    type: e.type,
    module: eventModule(e.type),
    summary: eventSummary(e.type, e.payload ?? {}),
    at: e.created_at,
  }))

  return {
    vendors, products, purchaseOrders, receipts, ledger, bills, journal, claims, events,
    financeSummary: raw.financeSummary,
  }
}

export async function fetchSpineSnapshot(token: string, tenantId: string): Promise<SpineSnapshot> {
  const q = (path: string) => apiFetch<Row[] | Row>(`${path}?tenant_id=${tenantId}`, { token })

  const [vendors, products, stock, purchaseOrders, receipts, ledger, bills, journal, claims, events, financeSummary] =
    await Promise.all([
      q('/v1/vendors'),
      q('/v1/products'),
      q('/v1/stock'),
      q('/v1/purchase-orders'),
      q('/v1/receipts'),
      q('/v1/inventory-ledger'),
      q('/v1/bills'),
      q('/v1/journal'),
      q('/v1/expense-claims'),
      q('/v1/events'),
      apiFetch<FinanceSummary>(`/v1/finance/summary?tenant_id=${tenantId}`, { token }),
    ])

  return adaptSpineData({
    vendors: vendors as Row[],
    products: products as Row[],
    stock: stock as Row[],
    purchaseOrders: purchaseOrders as Row[],
    receipts: receipts as Row[],
    ledger: ledger as Row[],
    bills: bills as Row[],
    journal: journal as Row[],
    claims: claims as Row[],
    events: events as Row[],
    financeSummary,
  })
}

export async function executeSpineAction(
  token: string,
  tenantId: string,
  action: { type: string; [key: string]: unknown },
  state: {
    bills: VendorBill[]
    purchaseOrders: PurchaseOrder[]
    vendors: Vendor[]
    products: Product[]
    settings: { confidenceThreshold: number; autoApplyEnabled: boolean }
  },
  draft?: CaptureDraft,
): Promise<void> {
  const post = <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', token, body: JSON.stringify(body) })

  switch (action.type) {
    case 'PAY_BILL': {
      const bill = state.bills.find((b) => b.id === action.billId)
      if (!bill || bill.status === 'paid') return
      const remaining = bill.amount - (bill.amountPaid ?? 0)
      await post('/v1/payments', {
        tenant_id: tenantId,
        vendor_id: bill.vendorId,
        amount: remaining,
        allocations: [{ bill_id: bill.id, amount: remaining }],
      })
      return
    }
    case 'APPROVE_CLAIM':
      await post(`/v1/expense-claims/${action.claimId}/approve`, {})
      return
    case 'REJECT_CLAIM':
      await post(`/v1/expense-claims/${action.claimId}/reject`, {})
      return
    case 'CREATE_REORDER_PO': {
      const variantId = String(action.productId)
      const product = state.products.find((p) => p.id === variantId)
      const vendorId = state.vendors[0]?.id
      if (!vendorId) throw new Error('No vendor found — create a vendor first')
      const po = await post<Row>('/v1/purchase-orders', {
        tenant_id: tenantId,
        vendor_id: vendorId,
        source: 'ai_reorder',
        lines: [{ variant_id: variantId, qty: Number(action.qty ?? 30), unit_cost: product?.unitCost ?? 0 }],
      })
      await post(`/v1/purchase-orders/${po.id}/send`, {})
      return
    }
    case 'APPLY_CAPTURE': {
      if (!draft) return
      const p = draft.payload as Record<string, string | number>
      switch (draft.intent) {
        case 'inventory_receipt':
          await post('/v1/receipts', {
            tenant_id: tenantId,
            vendor_id: p.vendorId,
            po_id: p.poId || undefined,
            type: 'commercial',
            lines: [{ variant_id: p.productId, qty: Number(p.qty) }],
          })
          return
        case 'sample_receipt':
          await post('/v1/receipts', {
            tenant_id: tenantId,
            vendor_id: p.vendorId,
            type: 'sample',
            lines: [{ description: String(p.description), qty: Number(p.qty) || 1 }],
          })
          return
        case 'vendor_bill':
          await post('/v1/bills', {
            tenant_id: tenantId,
            vendor_id: p.vendorId,
            amount: Number(p.amount),
            due_date: String(p.dueDate).slice(0, 10),
            memo: String(p.memo ?? 'Captured bill'),
          })
          return
        case 'expense_claim': {
          const code = CATEGORY_TO_CODE[String(p.category)] ?? '6900'
          const claim = await post<Row>('/v1/expense-claims', {
            tenant_id: tenantId,
            vendor_name: String(p.vendorName),
            amount: Number(p.amount),
            category_account_code: code,
            confidence: draft.confidence,
            source: 'ai_capture',
          })
          if (state.settings.autoApplyEnabled && draft.confidence >= state.settings.confidenceThreshold) {
            await post(`/v1/expense-claims/${claim.id}/approve`, {})
          }
          return
        }
        default:
          return // non-spine intents stay local
      }
    }
  }
}
