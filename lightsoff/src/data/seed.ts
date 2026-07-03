import type {
  Vendor, Warehouse, StockByWarehouse, Product, PurchaseOrder, Receipt, InventoryLedgerEntry, VendorBill,
  JournalEntry, ExpenseClaim, Campaign, Conversation, KanbanCard, Ticket, BusEvent,
} from '../types'

const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}
const daysFromNow = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString()
}

export const vendors: Vendor[] = [
  { id: 'v1', name: 'Acme Textiles', leadTimeDays: 12, isRecurring: true, contactEmail: 'orders@acmetextiles.com', phone: '+1 415-555-0101', paymentTerms: 'Net 30' },
  { id: 'v2', name: 'Pacific Trims Co.', leadTimeDays: 8, isRecurring: true, contactEmail: 'ap@pacifictrims.com', phone: '+1 213-555-0182', paymentTerms: 'Net 15' },
  { id: 'v3', name: 'Northwind Packaging', leadTimeDays: 5, isRecurring: true, contactEmail: 'billing@northwindpkg.com', phone: '+1 503-555-0144', paymentTerms: 'Due on receipt' },
  { id: 'v4', name: 'Kyoto Fabric Lab', leadTimeDays: 21, isRecurring: false, contactEmail: 'hello@kyotofabric.jp', phone: '+81 75-555-0199', paymentTerms: '50% deposit, Net 30' },
]

export const warehouses: Warehouse[] = [
  {
    id: 'wh-main', code: 'MAIN', name: 'Main warehouse', isDefault: true,
    contactName: 'Receiving desk', contactEmail: 'receiving@brand.com', contactPhone: '+1 415-555-0200',
    address: { line1: '1200 Market St', city: 'San Francisco', state: 'CA', postalCode: '94103', country: 'US' },
  },
  {
    id: 'wh-3pl', code: '3PL-EAST', name: 'East coast 3PL', isDefault: false,
    contactName: 'Fulfillment ops', contactEmail: 'ops@3pleast.com', contactPhone: '+1 732-555-0300',
    address: { line1: '88 Industrial Pkwy', line2: 'Unit 4', city: 'Newark', state: 'NJ', postalCode: '07114', country: 'US' },
  },
]

export const stockByWarehouse: StockByWarehouse[] = [
  { warehouseId: 'wh-main', warehouseCode: 'MAIN', warehouseName: 'Main warehouse', isDefault: true, variantId: 'p1', sku: 'HOOD-BLU-M', onHand: 14, reorderPoint: 20 },
  { warehouseId: 'wh-main', warehouseCode: 'MAIN', warehouseName: 'Main warehouse', isDefault: true, variantId: 'p2', sku: 'HOOD-BLU-L', onHand: 42, reorderPoint: 20 },
  { warehouseId: 'wh-main', warehouseCode: 'MAIN', warehouseName: 'Main warehouse', isDefault: true, variantId: 'p3', sku: 'TEE-RED-S', onHand: 0, reorderPoint: 15 },
  { warehouseId: 'wh-main', warehouseCode: 'MAIN', warehouseName: 'Main warehouse', isDefault: true, variantId: 'p4', sku: 'TEE-RED-M', onHand: 8, reorderPoint: 15 },
  { warehouseId: 'wh-main', warehouseCode: 'MAIN', warehouseName: 'Main warehouse', isDefault: true, variantId: 'p5', sku: 'CAP-BLK-OS', onHand: 62, reorderPoint: 25 },
  { warehouseId: 'wh-3pl', warehouseCode: '3PL-EAST', warehouseName: 'East coast 3PL', isDefault: false, variantId: 'p5', sku: 'CAP-BLK-OS', onHand: 35, reorderPoint: 25 },
  { warehouseId: 'wh-main', warehouseCode: 'MAIN', warehouseName: 'Main warehouse', isDefault: true, variantId: 'p6', sku: 'TOTE-NAT-OS', onHand: 31, reorderPoint: 10 },
]

export const products: Product[] = [
  { id: 'p1', sku: 'HOOD-BLU-M', name: 'Blue Hoodie (M)', stock: 14, reorderPoint: 20, unitCost: 18.5, price: 68, salesVelocityPerDay: 3.2, shopifySynced: true },
  { id: 'p2', sku: 'HOOD-BLU-L', name: 'Blue Hoodie (L)', stock: 42, reorderPoint: 20, unitCost: 18.5, price: 68, salesVelocityPerDay: 2.8, shopifySynced: true },
  { id: 'p3', sku: 'TEE-RED-S', name: 'Red Tee (S)', stock: 0, reorderPoint: 15, unitCost: 7.2, price: 32, salesVelocityPerDay: 4.1, shopifySynced: true },
  { id: 'p4', sku: 'TEE-RED-M', name: 'Red Tee (M)', stock: 8, reorderPoint: 15, unitCost: 7.2, price: 32, salesVelocityPerDay: 5.0, shopifySynced: true },
  { id: 'p5', sku: 'CAP-BLK-OS', name: 'Black Cap (One Size)', stock: 65, reorderPoint: 25, unitCost: 5.6, price: 28, salesVelocityPerDay: 1.4, shopifySynced: true },
  { id: 'p6', sku: 'TOTE-NAT-OS', name: 'Natural Tote', stock: 31, reorderPoint: 10, unitCost: 3.9, price: 22, salesVelocityPerDay: 0.9, shopifySynced: true },
]

export const purchaseOrders: PurchaseOrder[] = [
  {
    id: 'PO-1042', poNumber: 'PO-1042', vendorId: 'v1', status: 'sent', createdAt: daysAgo(6), source: 'ai_capture',
    lines: [
      { id: 'pl-1', productId: 'p1', qty: 60, unitCost: 18.5, receivedQty: 0 },
      { id: 'pl-2', productId: 'p2', qty: 40, unitCost: 18.5, receivedQty: 0 },
    ],
  },
  {
    id: 'PO-1041', poNumber: 'PO-1041', vendorId: 'v2', status: 'received', createdAt: daysAgo(14), source: 'manual',
    lines: [{ id: 'pl-3', productId: 'p5', qty: 100, unitCost: 5.6, receivedQty: 97 }],
  },
  {
    id: 'PO-1040', poNumber: 'PO-1040', vendorId: 'v3', status: 'received', createdAt: daysAgo(21), source: 'ai_capture',
    lines: [{ id: 'pl-4', productId: 'p6', qty: 50, unitCost: 3.9, receivedQty: 50 }],
  },
]

export const receipts: Receipt[] = [
  {
    id: 'RCV-311', poId: 'PO-1041', vendorId: 'v2', type: 'commercial', warehouseId: 'wh-main', warehouseCode: 'MAIN', warehouseName: 'Main warehouse',
    createdAt: daysAgo(4),
    lines: [{ productId: 'p5', description: 'Black Cap (One Size)', qty: 97 }],
    discrepancy: 'Received 97 of 100 ordered — 3 units short vs PO-1041.',
  },
  {
    id: 'RCV-312', poId: null, vendorId: 'v4', type: 'sample', createdAt: daysAgo(1),
    lines: [{ productId: null, description: 'Heavyweight slub cotton swatch — 320gsm', qty: 2 }],
    discrepancy: null,
  },
]

export const ledger: InventoryLedgerEntry[] = [
  { id: 'il1', productId: 'p5', qtyDelta: 97, reason: 'po_receipt', refId: 'RCV-311', at: daysAgo(4), warehouseId: 'wh-main', warehouseCode: 'MAIN', location: 'MAIN' },
  { id: 'il2', productId: 'p1', qtyDelta: -3, reason: 'shopify_sale', refId: 'shopify#5521', at: daysAgo(1) },
  { id: 'il3', productId: 'p3', qtyDelta: -4, reason: 'shopify_sale', refId: 'shopify#5520', at: daysAgo(1) },
  { id: 'il4', productId: 'p4', qtyDelta: -5, reason: 'shopify_sale', refId: 'shopify#5519', at: daysAgo(2) },
]

export const bills: VendorBill[] = [
  { id: 'BILL-208', vendorId: 'v2', amount: 560, dueDate: daysFromNow(3), status: 'unpaid', memo: 'PO-1041 caps restock', anomaly: null },
  { id: 'BILL-209', vendorId: 'v3', amount: 195, dueDate: daysFromNow(6), status: 'unpaid', memo: 'PO-1040 totes', anomaly: null },
  { id: 'BILL-210', vendorId: 'v4', amount: 1240, dueDate: daysFromNow(12), status: 'unpaid', memo: 'Sample development fee', anomaly: 'New vendor + amount 4x above typical bill size — held for explicit review.' },
  { id: 'BILL-205', vendorId: 'v1', amount: 1850, dueDate: daysAgo(10), status: 'paid', memo: 'PO-1038 hoodie run', anomaly: null },
]

export const journal: JournalEntry[] = [
  {
    id: 'JE-501', memo: 'Shopify payout — week 26', source: 'shopify_revenue', at: daysAgo(2), autoPosted: true,
    lines: [
      { account: 'Cash', debit: 4310, credit: 0 },
      { account: 'Sales Revenue', debit: 0, credit: 4310 },
    ],
  },
  {
    id: 'JE-502', memo: 'Meta Ads spend — auto-imported', source: 'ad_spend', at: daysAgo(1), autoPosted: true,
    lines: [
      { account: 'Advertising Expense', debit: 86, credit: 0 },
      { account: 'Cash', debit: 0, credit: 86 },
    ],
  },
  {
    id: 'JE-500', memo: 'Bill BILL-205 paid — Acme Textiles', source: 'inventory_ap', at: daysAgo(10), autoPosted: true,
    lines: [
      { account: 'Accounts Payable', debit: 1850, credit: 0 },
      { account: 'Cash', debit: 0, credit: 1850 },
    ],
  },
  {
    id: 'JE-499', memo: 'Northwind Packaging — recurring bill auto-categorized', source: 'inventory_ap', at: daysAgo(12), autoPosted: true,
    lines: [
      { account: 'Packaging Expense', debit: 145, credit: 0 },
      { account: 'Accounts Payable', debit: 0, credit: 145 },
    ],
  },
]

export const claims: ExpenseClaim[] = [
  { id: 'EC-31', vendorName: 'Uber Freight', amount: 74.2, category: 'Shipping & Freight', date: daysAgo(2), status: 'pending_review', confidence: 0.72, source: 'ai_capture' },
  { id: 'EC-30', vendorName: 'Canva Pro', amount: 12.99, category: 'Software', date: daysAgo(5), status: 'approved', confidence: 0.97, source: 'ai_capture' },
]

export const campaigns: Campaign[] = [
  { id: 'c1', name: 'Red Tee — IG Prospecting', platform: 'Meta', status: 'paused_oos', dailyBudget: 25, spend30d: 612, revenue30d: 1890, linkedSku: 'TEE-RED-S' },
  { id: 'c2', name: 'Hoodie Retargeting', platform: 'Meta', status: 'active', dailyBudget: 40, spend30d: 1140, revenue30d: 4820, linkedSku: 'HOOD-BLU-M' },
  { id: 'c3', name: 'Brand Search', platform: 'Google', status: 'active', dailyBudget: 15, spend30d: 430, revenue30d: 760, linkedSku: null },
]

export const conversations: Conversation[] = [
  {
    id: 'cv1', channel: 'instagram', customerName: 'Maya R.', subject: 'Is the red one back in stock?',
    sentiment: 'neutral', urgent: false, status: 'open',
    messages: [
      { id: 'm1', from: 'customer', body: 'Hi! Is the red tee in small coming back in stock soon? Been waiting 😅', at: daysAgo(0) },
    ],
    aiDraft: 'Hi Maya! Thanks so much for your patience 💛 The Red Tee (S) is currently out of stock, but we have a restock arriving in about 12 days — I can email you the moment it lands. In the meantime, the Red Tee in M is available if that could work!',
    aiDraftConfidence: 0.91,
    aiContext: ['Live stock: TEE-RED-S = 0 units', 'Open reorder ETA: ~12 days (Acme lead time)', 'TEE-RED-M in stock: 8 units'],
  },
  {
    id: 'cv2', channel: 'email', customerName: 'Daniel K.', subject: 'Order #5488 never arrived',
    sentiment: 'negative', urgent: true, status: 'open',
    messages: [
      { id: 'm2', from: 'customer', body: 'This is the second time I am writing. My order #5488 was marked delivered a week ago but I never received it. I want a refund or a replacement TODAY or I am disputing the charge.', at: daysAgo(0) },
    ],
    aiDraft: 'Hi Daniel, I\'m really sorry — this isn\'t the experience we want you to have. I can see order #5488 was marked delivered on the 24th, but since it never reached you, I\'d like to make it right immediately: I can ship a replacement today with express shipping, or issue a full refund — whichever you prefer. Just reply with your choice and I\'ll action it within the hour.',
    aiDraftConfidence: 0.62,
    aiContext: ['Order #5488: marked delivered 7 days ago (carrier scan)', 'Customer LTV: $214, 3 prior orders', 'Negative sentiment + dispute threat → escalated, requires human review'],
  },
  {
    id: 'cv3', channel: 'whatsapp', customerName: 'Priya S.', subject: 'Where is my order?',
    sentiment: 'neutral', urgent: false, status: 'answered',
    messages: [
      { id: 'm3', from: 'customer', body: 'hey, any update on my order #5502?', at: daysAgo(1) },
      { id: 'm4', from: 'brand', body: 'Hi Priya! Order #5502 shipped yesterday via DHL — tracking says it\'s out for delivery tomorrow. Tracking link: dhl.com/track/882…', at: daysAgo(1) },
    ],
    aiDraft: null, aiDraftConfidence: 0, aiContext: [],
  },
]

export const cards: KanbanCard[] = [
  { id: 'k1', title: 'Heavyweight slub cotton — Kyoto Fabric Lab', vendorId: 'v4', stage: 'received', receiptId: 'RCV-312', blockers: [], daysInStage: 1, note: 'Auto-created from sample receipt RCV-312.' },
  { id: 'k2', title: 'Recycled poly zip fleece', vendorId: 'v1', stage: 'in_review', receiptId: null, blockers: [], daysInStage: 9, note: 'Wash test pending — sitting in review 9 days.' },
  { id: 'k3', title: 'Corduroy cap prototype', vendorId: 'v2', stage: 'requested', receiptId: null, blockers: ['Vendor response pending since last Tuesday'], daysInStage: 6, note: '' },
  { id: 'k4', title: 'Organic cotton tote v2', vendorId: 'v3', stage: 'approved', receiptId: null, blockers: [], daysInStage: 2, note: 'Ready to spec as SKU — needs cost sheet.' },
]

export const tickets: Ticket[] = [
  {
    id: 'T-88', title: 'Approve expense claim EC-31 (Uber Freight $74.20)', body: 'AI categorized as Shipping & Freight at 72% confidence — below your 85% auto-apply threshold, so it\'s routed here for approval.',
    status: 'awaiting_user', createdAt: daysAgo(2),
    links: [{ refType: 'claim', refId: 'EC-31', label: 'Expense claim EC-31' }],
  },
  {
    id: 'T-87', title: 'Receiving discrepancy on PO-1041', body: 'Receipt RCV-311 logged 97 units vs 100 ordered. Options: accept short shipment and request credit, or ask Pacific Trims to ship the 3 missing caps.',
    status: 'open', createdAt: daysAgo(4),
    links: [
      { refType: 'po', refId: 'PO-1041', label: 'PO-1041' },
      { refType: 'bill', refId: 'BILL-208', label: 'Bill BILL-208' },
    ],
  },
  {
    id: 'T-86', title: 'Corduroy cap blocked on vendor', body: 'Kanban card has been blocked 6 days waiting on Pacific Trims. Draft follow-up message is ready in outbox.',
    status: 'open', createdAt: daysAgo(3),
    links: [{ refType: 'card', refId: 'k3', label: 'R&D card: Corduroy cap prototype' }],
  },
]

export const events: BusEvent[] = [
  { id: 'e1', type: 'inventory.received', module: 'Inventory', summary: 'Sample receipt RCV-312 logged from Kyoto Fabric Lab', at: daysAgo(1) },
  { id: 'e2', type: 'rnd.card_advanced', module: 'R&D', summary: 'Card "Heavyweight slub cotton" auto-advanced to Received (from RCV-312)', at: daysAgo(1) },
  { id: 'e3', type: 'campaign.oos_paused', module: 'Marketing', summary: 'Paused "Red Tee — IG Prospecting" — TEE-RED-S went out of stock', at: daysAgo(2) },
  { id: 'e4', type: 'finance.auto_posted', module: 'Finance', summary: 'Meta ad spend $86 auto-posted to journal (JE-502)', at: daysAgo(1) },
  { id: 'e5', type: 'inventory.discrepancy', module: 'Inventory', summary: 'RCV-311 short 3 units vs PO-1041 — ticket T-87 created', at: daysAgo(4) },
  { id: 'e6', type: 'inbox.escalated', module: 'Inbox', summary: 'Negative-sentiment message from Daniel K. escalated to top of digest', at: daysAgo(0) },
  { id: 'e7', type: 'finance.anomaly_flagged', module: 'Finance', summary: 'BILL-210 held: new vendor + unusual amount', at: daysAgo(1) },
]
