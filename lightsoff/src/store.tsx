import { createContext, useCallback, useContext, useEffect, useReducer, useState, type ReactNode } from 'react'
import type {
  Vendor, Warehouse, StockByWarehouse, Product, ProductMaster, PurchaseOrder, Receipt, InventoryLedgerEntry, VendorBill, VendorPayment,
  JournalEntry, ExpenseClaim, Campaign, Conversation, KanbanCard, Ticket, BusEvent,
  Settings, CaptureDraft, CardStage,
} from './types'
import * as seed from './data/seed'
import type { AuthSession } from './api/config'
import { fetchSpineSnapshot, executeSpineAction, type SpineSnapshot, type FinanceSummary } from './api/spine'

export interface AppState {
  vendors: Vendor[]
  warehouses: Warehouse[]
  stockByWarehouse: StockByWarehouse[]
  products: Product[]
  productMasters: ProductMaster[]
  purchaseOrders: PurchaseOrder[]
  receipts: Receipt[]
  ledger: InventoryLedgerEntry[]
  bills: VendorBill[]
  payments: VendorPayment[]
  journal: JournalEntry[]
  claims: ExpenseClaim[]
  campaigns: Campaign[]
  conversations: Conversation[]
  cards: KanbanCard[]
  tickets: Ticket[]
  events: BusEvent[]
  settings: Settings
  dismissedDigest: string[]
  toast: string | null
  financeSummary: FinanceSummary | null
}

const initialState: AppState = {
  vendors: seed.vendors,
  warehouses: seed.warehouses,
  stockByWarehouse: seed.stockByWarehouse,
  products: seed.products,
  productMasters: [],
  purchaseOrders: seed.purchaseOrders,
  receipts: seed.receipts,
  ledger: seed.ledger,
  bills: seed.bills,
  payments: [],
  journal: seed.journal,
  claims: seed.claims,
  campaigns: seed.campaigns,
  conversations: seed.conversations,
  cards: seed.cards,
  tickets: seed.tickets,
  events: seed.events,
  settings: { confidenceThreshold: 0.85, autoApplyEnabled: true },
  dismissedDigest: [],
  toast: null,
  financeSummary: null,
}

type Action =
  | { type: 'APPROVE_REPLY'; convId: string; body: string }
  | { type: 'PAY_BILL'; billId: string }
  | { type: 'APPROVE_BILL_ANOMALY'; billId: string }
  | { type: 'APPROVE_CLAIM'; claimId: string }
  | { type: 'REJECT_CLAIM'; claimId: string }
  | { type: 'RESUME_CAMPAIGN'; campaignId: string }
  | { type: 'CREATE_REORDER_PO'; productId: string; qty: number }
  | { type: 'RESOLVE_TICKET'; ticketId: string }
  | { type: 'ADVANCE_CARD'; cardId: string; stage: CardStage }
  | { type: 'APPLY_CAPTURE'; draft: CaptureDraft }
  | { type: 'DISMISS_DIGEST'; key: string }
  | { type: 'SET_THRESHOLD'; value: number }
  | { type: 'SET_AUTO_APPLY'; value: boolean }
  | { type: 'SET_TOAST'; message: string | null }
  | { type: 'HYDRATE'; spine: SpineSnapshot }
  | { type: 'ADD_VENDOR'; name: string; leadTimeDays?: number }
  | { type: 'CREATE_WAREHOUSE'; code: string; name: string; isDefault?: boolean }
  | { type: 'ADD_PRODUCT'; title: string; sku: string; price?: number; unitCost?: number; reorderPoint?: number }
  | { type: 'CREATE_PO'; vendorId: string; variantId: string; qty: number; unitCost: number; send?: boolean }
  | { type: 'CREATE_RECEIPT'; vendorId: string; poId?: string; variantId: string; qty: number; warehouseId?: string; receiptType?: 'commercial' | 'sample'; description?: string }
  | { type: 'ADJUST_STOCK'; variantId: string; qtyDelta: number; warehouseId?: string; memo?: string }
  | { type: 'CREATE_BILL'; vendorId: string; amount: number; dueDate?: string; memo?: string }
  | { type: 'CREATE_EXPENSE_CLAIM'; vendorName: string; amount: number; category: string; autoApprove?: boolean }
  | { type: 'CREATE_JOURNAL'; memo: string; lines: { account: string; debit: number; credit: number }[] }

let seq = 1000
const nid = (prefix: string) => `${prefix}-${++seq}`
const now = () => new Date().toISOString()

function pushEvent(state: AppState, type: string, module: string, summary: string): BusEvent[] {
  return [{ id: nid('e'), type, module, summary, at: now() }, ...state.events]
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'APPROVE_REPLY': {
      const conversations = state.conversations.map((c) =>
        c.id === action.convId
          ? {
              ...c,
              status: 'answered' as const,
              aiDraft: null,
              messages: [...c.messages, { id: nid('m'), from: 'brand' as const, body: action.body, at: now() }],
            }
          : c,
      )
      const conv = state.conversations.find((c) => c.id === action.convId)
      return {
        ...state,
        conversations,
        events: pushEvent(state, 'inbox.reply_sent', 'Inbox', `Reply sent to ${conv?.customerName ?? 'customer'} (AI draft approved)`),
        toast: 'Reply sent.',
      }
    }
    case 'PAY_BILL': {
      const bill = state.bills.find((b) => b.id === action.billId)
      if (!bill) return state
      const je: JournalEntry = {
        id: nid('JE'),
        memo: `Bill ${bill.id} paid — ${state.vendors.find((v) => v.id === bill.vendorId)?.name ?? ''}`,
        source: 'inventory_ap',
        at: now(),
        autoPosted: true,
        lines: [
          { account: 'Accounts Payable', debit: bill.amount, credit: 0 },
          { account: 'Cash', debit: 0, credit: bill.amount },
        ],
      }
      return {
        ...state,
        bills: state.bills.map((b) => (b.id === action.billId ? { ...b, status: 'paid' as const } : b)),
        journal: [je, ...state.journal],
        events: pushEvent(state, 'bill.paid', 'Finance', `${bill.id} paid ($${bill.amount.toFixed(2)}) — journal entry auto-posted`),
        toast: `${bill.id} marked paid — journal entry ${je.id} auto-posted.`,
      }
    }
    case 'APPROVE_BILL_ANOMALY': {
      return {
        ...state,
        bills: state.bills.map((b) => (b.id === action.billId ? { ...b, anomaly: null } : b)),
        events: pushEvent(state, 'finance.anomaly_cleared', 'Finance', `${action.billId} anomaly reviewed and approved by user`),
        toast: 'Anomaly cleared — bill approved for normal AP flow.',
      }
    }
    case 'APPROVE_CLAIM': {
      const claim = state.claims.find((c) => c.id === action.claimId)
      if (!claim) return state
      const je: JournalEntry = {
        id: nid('JE'),
        memo: `Expense claim ${claim.id} — ${claim.vendorName} (${claim.category})`,
        source: 'expense_claim',
        at: now(),
        autoPosted: false,
        lines: [
          { account: claim.category, debit: claim.amount, credit: 0 },
          { account: 'Petty Cash', debit: 0, credit: claim.amount },
        ],
      }
      return {
        ...state,
        claims: state.claims.map((c) => (c.id === action.claimId ? { ...c, status: 'approved' as const } : c)),
        journal: [je, ...state.journal],
        tickets: state.tickets.map((t) =>
          t.links.some((l) => l.refType === 'claim' && l.refId === action.claimId) ? { ...t, status: 'resolved' as const } : t,
        ),
        events: pushEvent(state, 'claim.approved', 'Finance', `Expense claim ${claim.id} approved — posted to journal`),
        toast: `Claim ${claim.id} approved and posted. Linked ticket auto-resolved.`,
      }
    }
    case 'REJECT_CLAIM': {
      return {
        ...state,
        claims: state.claims.map((c) => (c.id === action.claimId ? { ...c, status: 'rejected' as const } : c)),
        tickets: state.tickets.map((t) =>
          t.links.some((l) => l.refType === 'claim' && l.refId === action.claimId) ? { ...t, status: 'resolved' as const } : t,
        ),
        events: pushEvent(state, 'claim.rejected', 'Finance', `Expense claim ${action.claimId} rejected by user`),
        toast: 'Claim rejected.',
      }
    }
    case 'RESUME_CAMPAIGN': {
      const camp = state.campaigns.find((c) => c.id === action.campaignId)
      return {
        ...state,
        campaigns: state.campaigns.map((c) => (c.id === action.campaignId ? { ...c, status: 'active' as const } : c)),
        events: pushEvent(state, 'campaign.resumed', 'Marketing', `"${camp?.name ?? ''}" resumed by user approval`),
        toast: 'Campaign resumed.',
      }
    }
    case 'CREATE_REORDER_PO': {
      const product = state.products.find((p) => p.id === action.productId)
      if (!product) return state
      const vendor = state.vendors[0]
      const po: PurchaseOrder = {
        id: nid('PO'),
        vendorId: vendor.id,
        status: 'draft',
        createdAt: now(),
        source: 'ai_reorder',
        lines: [{ productId: product.id, qty: action.qty, unitCost: product.unitCost }],
      }
      return {
        ...state,
        purchaseOrders: [po, ...state.purchaseOrders],
        events: pushEvent(state, 'po.drafted', 'Inventory', `AI reorder ${po.id} drafted: ${action.qty}× ${product.sku} from ${vendor.name}`),
        toast: `Reorder ${po.id} drafted (${action.qty}× ${product.sku}).`,
      }
    }
    case 'RESOLVE_TICKET': {
      return {
        ...state,
        tickets: state.tickets.map((t) => (t.id === action.ticketId ? { ...t, status: 'resolved' as const } : t)),
        events: pushEvent(state, 'ticket.resolved', 'Collab', `Ticket ${action.ticketId} resolved`),
        toast: 'Ticket resolved.',
      }
    }
    case 'ADVANCE_CARD': {
      const card = state.cards.find((c) => c.id === action.cardId)
      return {
        ...state,
        cards: state.cards.map((c) =>
          c.id === action.cardId ? { ...c, stage: action.stage, daysInStage: 0, blockers: [] } : c,
        ),
        events: pushEvent(state, 'rnd.card_advanced', 'R&D', `Card "${card?.title ?? ''}" moved to ${action.stage.replace(/_/g, ' ')}`),
        toast: 'Card advanced.',
      }
    }
    case 'APPLY_CAPTURE':
      return applyCapture(state, action.draft)
    case 'DISMISS_DIGEST':
      return { ...state, dismissedDigest: [...state.dismissedDigest, action.key] }
    case 'SET_THRESHOLD':
      return { ...state, settings: { ...state.settings, confidenceThreshold: action.value } }
    case 'SET_AUTO_APPLY':
      return { ...state, settings: { ...state.settings, autoApplyEnabled: action.value } }
    case 'SET_TOAST':
      return { ...state, toast: action.message }
    case 'HYDRATE':
      return {
        ...state,
        vendors: action.spine.vendors,
        warehouses: action.spine.warehouses,
        stockByWarehouse: action.spine.stockByWarehouse,
        products: action.spine.products,
        productMasters: action.spine.productMasters,
        purchaseOrders: action.spine.purchaseOrders,
        receipts: action.spine.receipts,
        ledger: action.spine.ledger,
        bills: action.spine.bills,
        payments: action.spine.payments,
        journal: action.spine.journal,
        claims: action.spine.claims,
        events: action.spine.events,
        financeSummary: action.spine.financeSummary,
      }
    case 'ADD_VENDOR': {
      const vendor: Vendor = {
        id: nid('v'),
        name: action.name,
        leadTimeDays: action.leadTimeDays ?? 14,
        isRecurring: true,
      }
      return {
        ...state,
        vendors: [...state.vendors, vendor],
        events: pushEvent(state, 'vendor.created', 'Inventory', `Vendor "${action.name}" added`),
        toast: `Vendor "${action.name}" created.`,
      }
    }
    case 'CREATE_WAREHOUSE': {
      const warehouse: Warehouse = {
        id: nid('wh'),
        code: action.code.toUpperCase(),
        name: action.name,
        isDefault: action.isDefault ?? false,
      }
      const warehouses = action.isDefault
        ? state.warehouses.map((w) => ({ ...w, isDefault: false }))
        : state.warehouses
      return {
        ...state,
        warehouses: [...warehouses, warehouse],
        events: pushEvent(state, 'warehouse.created', 'Inventory', `Location ${action.code} added`),
        toast: `Warehouse ${action.code} created.`,
      }
    }
    case 'ADD_PRODUCT': {
      const product: Product = {
        id: nid('p'),
        sku: action.sku,
        name: action.title,
        stock: 0,
        reorderPoint: action.reorderPoint ?? 0,
        unitCost: action.unitCost ?? 0,
        price: action.price ?? 0,
        salesVelocityPerDay: 0,
        shopifySynced: false,
      }
      return {
        ...state,
        products: [...state.products, product],
        events: pushEvent(state, 'product.created', 'Inventory', `Product ${action.sku} added to master data`),
        toast: `Product ${action.sku} created.`,
      }
    }
    case 'CREATE_PO': {
      const po: PurchaseOrder = {
        id: nid('PO'),
        vendorId: action.vendorId,
        status: action.send ? 'sent' : 'draft',
        source: 'manual',
        createdAt: now(),
        lines: [{ productId: action.variantId, qty: action.qty, unitCost: action.unitCost }],
      }
      return {
        ...state,
        purchaseOrders: [po, ...state.purchaseOrders],
        events: pushEvent(state, 'po.drafted', 'Inventory', `${po.id} created (${action.qty} units)`),
        toast: `Purchase order ${po.id} ${action.send ? 'sent' : 'saved as draft'}.`,
      }
    }
    case 'CREATE_RECEIPT': {
      const product = action.variantId ? state.products.find((p) => p.id === action.variantId) : undefined
      const warehouse = action.warehouseId
        ? state.warehouses.find((w) => w.id === action.warehouseId)
        : state.warehouses.find((w) => w.isDefault) ?? state.warehouses[0]
      const receipt: Receipt = {
        id: nid('RCV'),
        poId: action.poId ?? null,
        vendorId: action.vendorId,
        type: action.receiptType ?? 'commercial',
        warehouseId: warehouse?.id,
        warehouseCode: warehouse?.code,
        warehouseName: warehouse?.name,
        createdAt: now(),
        lines: [{
          productId: action.variantId || null,
          description: action.description ?? product?.name ?? 'Sample item',
          qty: action.qty,
        }],
        discrepancy: null,
      }
      const next: AppState = {
        ...state,
        receipts: [receipt, ...state.receipts],
        events: pushEvent(state, 'inventory.received', 'Inventory', `${receipt.id}: +${action.qty} received`),
        toast: `Receipt ${receipt.id} recorded.`,
      }
      if (action.receiptType !== 'sample' && product) {
        const entry: InventoryLedgerEntry = {
          id: nid('il'),
          productId: product.id,
          qtyDelta: action.qty,
          reason: 'po_receipt',
          refId: receipt.id,
          at: now(),
          warehouseId: warehouse?.id,
          warehouseCode: warehouse?.code,
          location: warehouse?.code,
        }
        const stockByWarehouse = [...next.stockByWarehouse]
        if (warehouse) {
          const idx = stockByWarehouse.findIndex((s) => s.warehouseId === warehouse.id && s.variantId === product.id)
          if (idx >= 0) {
            stockByWarehouse[idx] = { ...stockByWarehouse[idx], onHand: stockByWarehouse[idx].onHand + action.qty }
          } else {
            stockByWarehouse.push({
              warehouseId: warehouse.id,
              warehouseCode: warehouse.code,
              warehouseName: warehouse.name,
              isDefault: warehouse.isDefault,
              variantId: product.id,
              sku: product.sku,
              onHand: action.qty,
              reorderPoint: product.reorderPoint,
            })
          }
        }
        return {
          ...next,
          ledger: [entry, ...next.ledger],
          stockByWarehouse,
          products: next.products.map((p) => (p.id === product.id ? { ...p, stock: p.stock + action.qty } : p)),
        }
      }
      return next
    }
    case 'ADJUST_STOCK': {
      const product = state.products.find((p) => p.id === action.variantId)
      if (!product) return { ...state, toast: 'Product not found.' }
      const warehouse = action.warehouseId
        ? state.warehouses.find((w) => w.id === action.warehouseId)
        : state.warehouses.find((w) => w.isDefault) ?? state.warehouses[0]
      const refId = nid('adj')
      const entry: InventoryLedgerEntry = {
        id: nid('il'),
        productId: product.id,
        qtyDelta: action.qtyDelta,
        reason: 'manual_adjustment',
        refId,
        at: now(),
        warehouseId: warehouse?.id,
        warehouseCode: warehouse?.code,
        location: warehouse?.code,
      }
      const stockByWarehouse = [...state.stockByWarehouse]
      if (warehouse) {
        const idx = stockByWarehouse.findIndex((s) => s.warehouseId === warehouse.id && s.variantId === product.id)
        if (idx >= 0) {
          stockByWarehouse[idx] = { ...stockByWarehouse[idx], onHand: stockByWarehouse[idx].onHand + action.qtyDelta }
        } else {
          stockByWarehouse.push({
            warehouseId: warehouse.id,
            warehouseCode: warehouse.code,
            warehouseName: warehouse.name,
            isDefault: warehouse.isDefault,
            variantId: product.id,
            sku: product.sku,
            onHand: action.qtyDelta,
            reorderPoint: product.reorderPoint,
          })
        }
      }
      return {
        ...state,
        ledger: [entry, ...state.ledger],
        stockByWarehouse,
        products: state.products.map((p) =>
          p.id === product.id ? { ...p, stock: p.stock + action.qtyDelta } : p,
        ),
        events: pushEvent(state, 'inventory.adjusted', 'Inventory', `${product.sku} ${action.qtyDelta > 0 ? '+' : ''}${action.qtyDelta}`),
        toast: `Stock adjusted for ${product.sku}.`,
      }
    }
    case 'CREATE_BILL': {
      const bill: VendorBill = {
        id: nid('BILL'),
        vendorId: action.vendorId,
        amount: action.amount,
        dueDate: action.dueDate ?? now().slice(0, 10),
        status: 'unpaid',
        memo: action.memo ?? 'Manual bill',
        anomaly: null,
      }
      return {
        ...state,
        bills: [bill, ...state.bills],
        events: pushEvent(state, 'bill.created', 'Finance', `${bill.id} — $${action.amount.toFixed(2)}`),
        toast: `Bill ${bill.id} created.`,
      }
    }
    case 'CREATE_EXPENSE_CLAIM': {
      const claim: ExpenseClaim = {
        id: nid('EC'),
        vendorName: action.vendorName,
        amount: action.amount,
        category: action.category,
        date: now(),
        status: action.autoApprove ? 'approved' : 'pending_review',
        confidence: 1,
        source: 'manual',
      }
      let next: AppState = {
        ...state,
        claims: [claim, ...state.claims],
        events: pushEvent(
          state,
          action.autoApprove ? 'claim.approved' : 'claim.pending',
          'Finance',
          `Expense claim ${claim.id} — $${action.amount.toFixed(2)}`,
        ),
        toast: action.autoApprove ? 'Claim approved and posted.' : 'Claim submitted for review.',
      }
      if (action.autoApprove) {
        const je: JournalEntry = {
          id: nid('JE'),
          memo: `Expense claim ${claim.id} — ${claim.vendorName} (${claim.category})`,
          source: 'expense_claim',
          at: now(),
          autoPosted: false,
          lines: [
            { account: claim.category, debit: claim.amount, credit: 0 },
            { account: 'Petty Cash', debit: 0, credit: claim.amount },
          ],
        }
        next = { ...next, journal: [je, ...next.journal] }
      }
      return next
    }
    case 'CREATE_JOURNAL': {
      const je: JournalEntry = {
        id: nid('JE'),
        memo: action.memo,
        source: 'manual',
        at: now(),
        autoPosted: false,
        lines: action.lines,
      }
      return {
        ...state,
        journal: [je, ...state.journal],
        events: pushEvent(state, 'journal.posted', 'Finance', action.memo),
        toast: `Journal entry ${je.id} posted.`,
      }
    }
    default:
      return state
  }
}

function applyCapture(state: AppState, draft: CaptureDraft): AppState {
  const p = draft.payload as Record<string, string | number>
  switch (draft.intent) {
    case 'inventory_receipt': {
      const product = state.products.find((x) => x.id === p.productId)
      const qty = Number(p.qty)
      if (!product) return state
      const receipt: Receipt = {
        id: nid('RCV'),
        poId: (p.poId as string) || null,
        vendorId: (p.vendorId as string) || state.vendors[0].id,
        type: 'commercial',
        createdAt: now(),
        lines: [{ productId: product.id, description: product.name, qty }],
        discrepancy: null,
      }
      const entry: InventoryLedgerEntry = {
        id: nid('il'), productId: product.id, qtyDelta: qty, reason: 'po_receipt', refId: receipt.id, at: now(),
      }
      return {
        ...state,
        receipts: [receipt, ...state.receipts],
        ledger: [entry, ...state.ledger],
        products: state.products.map((x) => (x.id === product.id ? { ...x, stock: x.stock + qty } : x)),
        events: pushEvent(state, 'inventory.received', 'Inventory', `${receipt.id}: +${qty} ${product.sku} received — stock pushed to Shopify`),
        toast: `Receipt ${receipt.id} confirmed. Stock +${qty} → synced to Shopify.`,
      }
    }
    case 'sample_receipt': {
      const receipt: Receipt = {
        id: nid('RCV'),
        poId: null,
        vendorId: (p.vendorId as string) || state.vendors[3].id,
        type: 'sample',
        createdAt: now(),
        lines: [{ productId: null, description: String(p.description), qty: Number(p.qty) || 1 }],
        discrepancy: null,
      }
      const card: KanbanCard = {
        id: nid('k'),
        title: String(p.description),
        vendorId: receipt.vendorId,
        stage: 'received',
        receiptId: receipt.id,
        blockers: [],
        daysInStage: 0,
        note: `Auto-created from sample receipt ${receipt.id}.`,
      }
      const withReceiptEvent = { ...state, events: pushEvent(state, 'inventory.received', 'Inventory', `Sample receipt ${receipt.id} logged`) }
      return {
        ...state,
        receipts: [receipt, ...state.receipts],
        cards: [card, ...state.cards],
        events: pushEvent(withReceiptEvent, 'rnd.card_created', 'R&D', `Kanban card auto-created from ${receipt.id}: "${card.title}"`),
        toast: `Sample logged — R&D card created automatically.`,
      }
    }
    case 'vendor_bill': {
      const bill: VendorBill = {
        id: nid('BILL'),
        vendorId: (p.vendorId as string) || state.vendors[0].id,
        amount: Number(p.amount),
        dueDate: String(p.dueDate),
        status: 'unpaid',
        memo: String(p.memo),
        anomaly: null,
      }
      return {
        ...state,
        bills: [bill, ...state.bills],
        events: pushEvent(state, 'bill.created', 'Finance', `${bill.id} extracted from forwarded email ($${bill.amount.toFixed(2)})`),
        toast: `Bill ${bill.id} created from capture.`,
      }
    }
    case 'expense_claim': {
      const autoApproved = state.settings.autoApplyEnabled && draft.confidence >= state.settings.confidenceThreshold
      const claim: ExpenseClaim = {
        id: nid('EC'),
        vendorName: String(p.vendorName),
        amount: Number(p.amount),
        category: String(p.category),
        date: now(),
        status: autoApproved ? 'approved' : 'pending_review',
        confidence: draft.confidence,
        source: 'ai_capture',
      }
      let next: AppState = {
        ...state,
        claims: [claim, ...state.claims],
        events: pushEvent(
          state,
          autoApproved ? 'claim.auto_applied' : 'claim.pending',
          'Finance',
          autoApproved
            ? `Claim ${claim.id} auto-applied at ${(draft.confidence * 100).toFixed(0)}% confidence (undo window open)`
            : `Claim ${claim.id} below threshold — routed to approval ticket`,
        ),
        toast: autoApproved
          ? `Claim auto-applied (${(draft.confidence * 100).toFixed(0)}% ≥ ${(state.settings.confidenceThreshold * 100).toFixed(0)}% threshold).`
          : `Claim held for review (${(draft.confidence * 100).toFixed(0)}% < ${(state.settings.confidenceThreshold * 100).toFixed(0)}% threshold) — ticket created.`,
      }
      if (autoApproved) {
        const je: JournalEntry = {
          id: nid('JE'),
          memo: `Expense claim ${claim.id} — ${claim.vendorName} (${claim.category})`,
          source: 'expense_claim',
          at: now(),
          autoPosted: true,
          lines: [
            { account: claim.category, debit: claim.amount, credit: 0 },
            { account: 'Petty Cash', debit: 0, credit: claim.amount },
          ],
        }
        next = { ...next, journal: [je, ...next.journal] }
      } else {
        const ticket: Ticket = {
          id: nid('T'),
          title: `Approve expense claim ${claim.id} (${claim.vendorName} $${claim.amount.toFixed(2)})`,
          body: `AI categorized as ${claim.category} at ${(draft.confidence * 100).toFixed(0)}% confidence — below your auto-apply threshold.`,
          status: 'awaiting_user',
          createdAt: now(),
          links: [{ refType: 'claim', refId: claim.id, label: `Expense claim ${claim.id}` }],
        }
        next = { ...next, tickets: [ticket, ...next.tickets] }
      }
      return next
    }
    case 'inbox_route': {
      const conv: Conversation = {
        id: nid('cv'),
        channel: 'instagram',
        customerName: String(p.customerName || 'Customer'),
        subject: String(p.subject),
        sentiment: 'neutral',
        urgent: false,
        status: 'open',
        messages: [{ id: nid('m'), from: 'customer', body: String(p.body), at: now() }],
        aiDraft: String(p.aiDraft),
        aiDraftConfidence: draft.confidence,
        aiContext: (p.aiContext as unknown as string[]) || [],
      }
      return {
        ...state,
        conversations: [conv, ...state.conversations],
        events: pushEvent(state, 'inbox.routed', 'Inbox', `Captured message routed to Inbox with stock context — draft ready`),
        toast: 'Routed to Inbox — AI reply drafted with live stock context.',
      }
    }
    case 'note_ticket': {
      const ticket: Ticket = {
        id: nid('T'),
        title: String(p.title),
        body: String(p.body),
        status: 'open',
        createdAt: now(),
        links: [],
      }
      return {
        ...state,
        tickets: [ticket, ...state.tickets],
        events: pushEvent(state, 'ticket.created', 'Collab', `Ticket ${ticket.id} created from capture`),
        toast: `Ticket ${ticket.id} created.`,
      }
    }
  }
}

const StoreContext = createContext<{
  state: AppState
  dispatch: (action: Action) => void | Promise<void>
  refresh: () => Promise<void>
  spineMutate: (live: () => Promise<unknown>, demo: Action) => Promise<void>
  mode: 'demo' | 'live'
  loading: boolean
  auth: AuthSession | null
} | null>(null)

const SPINE_ACTIONS = new Set(['PAY_BILL', 'APPROVE_CLAIM', 'REJECT_CLAIM', 'CREATE_REORDER_PO'])
const SPINE_CAPTURE = new Set(['inventory_receipt', 'sample_receipt', 'vendor_bill', 'expense_claim'])

function toastFor(action: Action): string {
  switch (action.type) {
    case 'PAY_BILL': return 'Payment recorded — journal entry auto-posted.'
    case 'APPROVE_CLAIM': return 'Claim approved and posted.'
    case 'REJECT_CLAIM': return 'Claim rejected.'
    case 'CREATE_REORDER_PO': return 'Reorder PO drafted and sent.'
    case 'APPLY_CAPTURE': return 'Capture applied.'
    default: return 'Done.'
  }
}

export function StoreProvider({
  children,
  auth,
  mode,
}: {
  children: ReactNode
  auth: AuthSession | null
  mode: 'demo' | 'live'
}) {
  const [state, rawDispatch] = useReducer(reducer, initialState)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (mode !== 'live' || !auth) return
    setLoading(true)
    try {
      const spine = await fetchSpineSnapshot(auth.token, auth.tenantId)
      rawDispatch({ type: 'HYDRATE', spine })
    } finally {
      setLoading(false)
    }
  }, [auth, mode])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const spineMutate = useCallback(
    async (live: () => Promise<unknown>, demo: Action) => {
      try {
        if (mode === 'live' && auth) {
          await live()
          await refresh()
        } else {
          rawDispatch(demo)
        }
      } catch (err) {
        rawDispatch({ type: 'SET_TOAST', message: (err as Error).message })
      }
    },
    [mode, auth, refresh],
  )

  const dispatch = useCallback(
    async (action: Action) => {
      const isLiveSpine =
        mode === 'live' &&
        auth &&
        (SPINE_ACTIONS.has(action.type) ||
          (action.type === 'APPLY_CAPTURE' && SPINE_CAPTURE.has(action.draft.intent)))

      if (isLiveSpine) {
        try {
          await executeSpineAction(
            auth!.token,
            auth!.tenantId,
            action,
            { bills: state.bills, purchaseOrders: state.purchaseOrders, settings: state.settings, vendors: state.vendors, products: state.products },
            action.type === 'APPLY_CAPTURE' ? action.draft : undefined,
          )
          await refresh()
          rawDispatch({ type: 'SET_TOAST', message: toastFor(action) })
        } catch (err) {
          rawDispatch({ type: 'SET_TOAST', message: (err as Error).message })
        }
        return
      }
      rawDispatch(action)
    },
    [mode, auth, state.bills, state.purchaseOrders, state.settings, state.vendors, state.products, refresh],
  )

  return (
    <StoreContext.Provider value={{ state, dispatch, refresh, spineMutate, mode, loading, auth }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
