// Entity model based on the product spec Section 7 (simplified for prototype)

export type Confidence = number // 0..1

export interface LocationAddress {
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

export interface Vendor {
  id: string
  name: string
  leadTimeDays: number
  isRecurring: boolean
  contactEmail?: string
  phone?: string
  paymentTerms?: string
  notes?: string
}

export interface Warehouse {
  id: string
  code: string
  name: string
  isDefault: boolean
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  address?: LocationAddress
}

export interface StockByWarehouse {
  warehouseId: string
  warehouseCode: string
  warehouseName: string
  isDefault: boolean
  variantId: string
  sku: string
  onHand: number
  reorderPoint: number
}

export interface Product {
  id: string
  productId?: string
  sku: string
  name: string
  stock: number
  reorderPoint: number
  unitCost: number
  price: number
  salesVelocityPerDay: number
  shopifySynced: boolean
  barcode?: string
  weight?: number
  weightUnit?: string
  optionValues?: Record<string, string>
}

export interface ProductMaster {
  id: string
  title: string
  description?: string
  brand?: string
  productType?: string
  defaultVendorId?: string
  customAttributes?: Record<string, unknown>
  options: { id?: string; name: string; values: string[] }[]
  variants: Product[]
}

export type POStatus = 'draft' | 'sent' | 'partially_received' | 'received' | 'closed'

export interface POLineItem {
  id?: string
  productId: string
  qty: number
  unitCost: number
  receivedQty?: number
  lineTotal?: number
  description?: string
}

export interface PurchaseOrder {
  id: string
  poNumber?: string
  vendorId: string
  status: POStatus
  lines: POLineItem[]
  createdAt: string
  source: 'ai_capture' | 'ai_reorder' | 'manual'
  linkedBills?: { id: string; billNumber?: string; amount: number; status: string }[]
}

export type ReceiptType = 'commercial' | 'sample'

export interface Receipt {
  id: string
  poId: string | null
  vendorId: string
  type: ReceiptType
  warehouseId?: string
  warehouseCode?: string
  warehouseName?: string
  lines: { id?: string; productId: string | null; description: string; qty: number; poLineItemId?: string }[]
  discrepancy: string | null
  createdAt: string
  linkedBills?: { id: string; billNumber?: string; amount: number; status: string }[]
}

export interface InventoryLedgerEntry {
  id: string
  productId: string
  qtyDelta: number
  reason: 'po_receipt' | 'shopify_sale' | 'manual_adjustment' | 'sample_receipt'
  refId: string
  at: string
  warehouseId?: string
  warehouseCode?: string
  location?: string
}

export type BillStatus = 'unpaid' | 'partially_paid' | 'scheduled' | 'paid'

export interface VendorBillLine {
  id?: string
  lineNumber?: number
  productId?: string
  description?: string
  qty: number
  unitCost: number
  lineAmount: number
  poLineItemId?: string
  receiptLineItemId?: string
}

export interface VendorBillPayment {
  paymentId: string
  amount: number
  paidAt?: string
  method?: string
}

export interface VendorBill {
  id: string
  vendorId: string
  poId?: string
  receiptId?: string
  poNumber?: string
  billNumber?: string
  amount: number
  dueDate: string
  status: BillStatus
  memo: string
  anomaly: string | null
  amountPaid?: number
  lines?: VendorBillLine[]
  payments?: VendorBillPayment[]
}

export interface VendorPayment {
  id: string
  vendorId: string
  amount: number
  method: string
  paidAt: string
  memo?: string
  allocations: { billId: string; amount: number; billNumber?: string; billStatus?: string }[]
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
export type AiRisk = 'low' | 'medium' | 'high'
export type SendPolicyState = 'ready' | 'needs_secrets' | 'receive_only' | 'outside_service_window' | 'blocked'

export type ChannelSetupStatus = 'not_configured' | 'needs_secrets' | 'testing' | 'connected' | 'degraded' | 'error'
export type WebhookHealth = 'unknown' | 'healthy' | 'failing'

export interface ChannelAccount {
  id: string
  channel: ChannelKind
  displayName: string
  setupStatus: ChannelSetupStatus
  webhookStatus: WebhookHealth
  sendEnabled: boolean
  receiveEnabled: boolean
  requiredSecrets: string[]
  setupChecklist: string[]
  webhookFunction: string
  webhookQuery?: string
  lastInboundAt?: string
  lastOutboundAt?: string
  lastTestAt?: string
  lastError?: string
}

export interface ConnectorTestRun {
  id: string
  channel: ChannelKind
  testType: 'secrets' | 'webhook' | 'inbound' | 'outbound'
  status: 'success' | 'failed' | 'blocked'
  message: string
  at: string
}

export interface AiDraftRecord {
  id: string
  conversationId: string
  channel: ChannelKind
  intent: string
  risk: AiRisk
  summary: string
  body: string
  confidence: Confidence
  approvalState: 'draft' | 'approved' | 'sent' | 'discarded' | 'blocked'
  createdAt: string
  approvedAt?: string
  sentAt?: string
}

export interface Message {
  id: string
  from: 'customer' | 'brand'
  body: string
  at: string
}

export interface Conversation {
  id: string
  channel: ChannelKind
  channelAccountId?: string
  externalThreadId?: string
  externalCustomerId?: string
  customerName: string
  subject: string
  messages: Message[]
  sentiment: Sentiment
  urgent: boolean
  status: 'open' | 'answered' | 'closed'
  aiDraft: string | null
  aiDraftId?: string
  aiDraftConfidence: Confidence
  aiContext: string[]
  aiIntent?: string
  aiRisk?: AiRisk
  aiSummary?: string
  sendPolicyState?: SendPolicyState
  lastExternalMessageAt?: string
  serviceWindowUntil?: string
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
