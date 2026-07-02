// Entity model based on the product spec Section 7 (simplified for prototype)

export type Confidence = number // 0..1

export interface Vendor {
  id: string
  name: string
  leadTimeDays: number
  isRecurring: boolean
}

export interface Product {
  id: string
  sku: string
  name: string
  stock: number
  reorderPoint: number
  unitCost: number
  price: number
  salesVelocityPerDay: number
  shopifySynced: boolean
}

export type POStatus = 'draft' | 'sent' | 'partially_received' | 'received' | 'closed'

export interface POLineItem {
  productId: string
  qty: number
  unitCost: number
}

export interface PurchaseOrder {
  id: string
  vendorId: string
  status: POStatus
  lines: POLineItem[]
  createdAt: string
  source: 'ai_capture' | 'ai_reorder' | 'manual'
}

export type ReceiptType = 'commercial' | 'sample'

export interface Receipt {
  id: string
  poId: string | null
  vendorId: string
  type: ReceiptType
  lines: { productId: string | null; description: string; qty: number }[]
  discrepancy: string | null
  createdAt: string
}

export interface InventoryLedgerEntry {
  id: string
  productId: string
  qtyDelta: number
  reason: 'po_receipt' | 'shopify_sale' | 'manual_adjustment' | 'sample_receipt'
  refId: string
  at: string
}

export type BillStatus = 'unpaid' | 'scheduled' | 'paid'

export interface VendorBill {
  id: string
  vendorId: string
  amount: number
  dueDate: string
  status: BillStatus
  memo: string
  anomaly: string | null
}

export interface JournalLine {
  account: string
  debit: number
  credit: number
}

export interface JournalEntry {
  id: string
  memo: string
  lines: JournalLine[]
  source: 'inventory_ap' | 'ad_spend' | 'shopify_revenue' | 'expense_claim' | 'manual'
  at: string
  autoPosted: boolean
}

export type ClaimStatus = 'pending_review' | 'approved' | 'rejected'

export interface ExpenseClaim {
  id: string
  vendorName: string
  amount: number
  category: string
  date: string
  status: ClaimStatus
  confidence: Confidence
  source: 'ai_capture' | 'manual'
}

export type CampaignStatus = 'active' | 'paused_oos' | 'paused_manual'

export interface Campaign {
  id: string
  name: string
  platform: 'Meta' | 'Google'
  status: CampaignStatus
  dailyBudget: number
  spend30d: number
  revenue30d: number
  linkedSku: string | null
}

export type ChannelKind = 'instagram' | 'whatsapp' | 'email' | 'facebook'
export type Sentiment = 'positive' | 'neutral' | 'negative'

export interface Message {
  id: string
  from: 'customer' | 'brand'
  body: string
  at: string
}

export interface Conversation {
  id: string
  channel: ChannelKind
  customerName: string
  subject: string
  messages: Message[]
  sentiment: Sentiment
  urgent: boolean
  status: 'open' | 'answered' | 'closed'
  aiDraft: string | null
  aiDraftConfidence: Confidence
  aiContext: string[]
}

export type CardStage = 'requested' | 'received' | 'in_review' | 'approved' | 'rejected' | 'specd_as_sku'

export interface KanbanCard {
  id: string
  title: string
  vendorId: string | null
  stage: CardStage
  receiptId: string | null
  blockers: string[]
  daysInStage: number
  note: string
}

export interface TicketLink {
  refType: 'po' | 'bill' | 'campaign' | 'card' | 'conversation' | 'claim'
  refId: string
  label: string
}

export interface Ticket {
  id: string
  title: string
  body: string
  status: 'open' | 'awaiting_user' | 'resolved'
  links: TicketLink[]
  createdAt: string
}

export interface BusEvent {
  id: string
  type: string
  module: string
  summary: string
  at: string
}

export interface Settings {
  confidenceThreshold: number // above this, low-stakes actions auto-apply
  autoApplyEnabled: boolean
}

// ---- AI capture drafts ----

export type CaptureIntent =
  | 'inventory_receipt'
  | 'vendor_bill'
  | 'expense_claim'
  | 'inbox_route'
  | 'sample_receipt'
  | 'note_ticket'

export interface CaptureDraft {
  intent: CaptureIntent
  intentLabel: string
  module: string
  confidence: Confidence
  stakes: 'low' | 'high'
  fields: { label: string; value: string }[]
  explanation: string
  payload: Record<string, unknown>
}
