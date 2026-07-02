import type { CaptureDraft } from '../types'
import type { AppState } from '../store'

// Simulated AI intent classifier + extractor. In production this is an LLM call;
// here it's deterministic rules so the prototype behaves predictably in demos.

const numberWords: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, hundred: 100,
}

function extractQty(text: string): number | null {
  const digits = text.match(/\b(\d+)\b/)
  if (digits) return parseInt(digits[1], 10)
  for (const [word, n] of Object.entries(numberWords)) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(text)) return n
  }
  return null
}

function extractAmount(text: string): number | null {
  const m = text.match(/\$?\s?(\d+(?:[.,]\d{1,2})?)\s?(?:dollars|usd|\$)?/i)
  const dollar = text.match(/\$\s?(\d+(?:[.,]\d{1,2})?)/)
  if (dollar) return parseFloat(dollar[1].replace(',', '.'))
  if (/\d+(?:[.,]\d{1,2})?\s?(dollars|usd)/i.test(text) && m) return parseFloat(m[1].replace(',', '.'))
  if (m && /(paid|cost|invoice|bill|receipt|spent|expense)/i.test(text)) return parseFloat(m[1].replace(',', '.'))
  return null
}

export function classifyCapture(text: string, state: AppState): CaptureDraft {
  const t = text.toLowerCase()

  // --- Sample receipt → R&D ---
  if (/sample|swatch|prototype/.test(t) && /(arriv|receiv|came|got|landed|deliver)/.test(t)) {
    const vendor = state.vendors.find((v) => t.includes(v.name.toLowerCase().split(' ')[0])) ?? state.vendors[3]
    const desc = text.replace(/^(a|the)\s+/i, '').trim()
    return {
      intent: 'sample_receipt',
      intentLabel: 'Sample receipt → R&D card',
      module: 'Inventory + R&D',
      confidence: 0.9,
      stakes: 'low',
      explanation: 'Detected a sample arrival. Will log a Receipt with type=sample and auto-create a Kanban card in the R&D pipeline (no duplicate sample tracking).',
      fields: [
        { label: 'Receipt type', value: 'sample' },
        { label: 'Vendor', value: vendor.name },
        { label: 'Description', value: desc },
        { label: 'R&D card stage', value: 'received' },
      ],
      payload: { vendorId: vendor.id, description: desc, qty: extractQty(text) ?? 1 },
    }
  }

  // --- Customer question → Inbox ---
  if (/customer|asking|dm|message from|wants to know|complain/.test(t)) {
    const product = state.products.find((p) => t.includes(p.name.toLowerCase().split(' ')[0]) || t.includes(p.sku.toLowerCase()))
      ?? (/red/.test(t) ? state.products[2] : /hoodie|blue/.test(t) ? state.products[0] : null)
    const stockLine = product
      ? `${product.sku} current stock: ${product.stock} unit${product.stock === 1 ? '' : 's'}`
      : 'No SKU matched — draft is generic'
    const draftReply = product
      ? product.stock > 0
        ? `Hi! Great news — the ${product.name} is in stock right now (${product.stock} left). Grab it here before it goes again! 💛`
        : `Hi! Thanks for checking in — the ${product.name} is currently sold out, but a restock is on the way. Want me to notify you the moment it lands?`
      : `Hi! Thanks for reaching out — happy to help. Could you tell me a bit more about which item you mean?`
    return {
      intent: 'inbox_route',
      intentLabel: 'Route to Unified Inbox',
      module: 'Inbox',
      confidence: product ? 0.88 : 0.61,
      stakes: 'low',
      explanation: 'Detected a customer conversation. Will create an Inbox conversation with an AI-drafted reply grounded in live stock from Inventory.',
      fields: [
        { label: 'Channel', value: 'Instagram DM (assumed)' },
        { label: 'Grounding context', value: stockLine },
        { label: 'Drafted reply', value: draftReply },
      ],
      payload: {
        customerName: 'Captured customer',
        subject: text.slice(0, 60),
        body: text,
        aiDraft: draftReply,
        aiContext: [stockLine, 'Source: routed from Capture'],
      },
    }
  }

  // --- Vendor bill / invoice ---
  if (/invoice|bill(?!board)/.test(t) || (/forward/.test(t) && /vendor/.test(t))) {
    const vendor = state.vendors.find((v) => t.includes(v.name.toLowerCase().split(' ')[0])) ?? state.vendors[0]
    const amount = extractAmount(text) ?? 480
    const due = new Date()
    due.setDate(due.getDate() + 14)
    return {
      intent: 'vendor_bill',
      intentLabel: 'Vendor bill extraction',
      module: 'Finance (AP)',
      confidence: vendor.isRecurring ? 0.93 : 0.7,
      stakes: amount > 1000 ? 'high' : 'low',
      explanation: `Detected a vendor invoice. Extracted vendor, amount, and a net-14 due date. ${vendor.isRecurring ? 'Known recurring vendor — high confidence.' : 'New vendor — lower confidence, flagged for review.'}`,
      fields: [
        { label: 'Vendor', value: vendor.name },
        { label: 'Amount', value: `$${amount.toFixed(2)}` },
        { label: 'Due', value: due.toLocaleDateString() },
        { label: 'Posts to', value: 'Accounts Payable (journal auto-entry on payment)' },
      ],
      payload: { vendorId: vendor.id, amount, dueDate: due.toISOString(), memo: text.slice(0, 80) },
    }
  }

  // --- Expense claim (receipt photo / spend description) ---
  if (/receipt|expense|paid|spent|taxi|uber|lunch|coffee|shipping cost|petty cash/.test(t)) {
    const amount = extractAmount(text) ?? 25
    const category = /uber|taxi|freight|shipping|courier/.test(t)
      ? 'Shipping & Freight'
      : /lunch|coffee|meal|dinner/.test(t)
        ? 'Meals & Entertainment'
        : /software|subscription|canva|figma/.test(t)
          ? 'Software'
          : 'General Expense'
    const known = category !== 'General Expense'
    const confidence = known ? 0.94 : 0.66
    return {
      intent: 'expense_claim',
      intentLabel: 'Expense claim extraction',
      module: 'Finance (Petty Cash)',
      confidence,
      stakes: amount > 200 ? 'high' : 'low',
      explanation: `Detected an expense. Categorized as "${category}". ${known ? 'High confidence — will auto-apply if above your threshold, with an undo window.' : 'Uncertain category — will pause for your approval via a Collab ticket.'}`,
      fields: [
        { label: 'Vendor / payee', value: text.match(/(?:at|from|to)\s+([A-Z][\w'&. ]{2,25})/)?.[1] ?? 'Extracted from capture' },
        { label: 'Amount', value: `$${amount.toFixed(2)}` },
        { label: 'Category', value: category },
        { label: 'Posts against', value: 'Petty Cash ledger' },
      ],
      payload: { vendorName: text.match(/(?:at|from|to)\s+([A-Z][\w'&. ]{2,25})/)?.[1] ?? 'Captured vendor', amount, category },
    }
  }

  // --- Inventory receipt ("received 50 blue hoodies from Acme") ---
  if (/(receiv|arriv|got|came in|delivered|restock)/.test(t)) {
    const qty = extractQty(text) ?? 10
    const product =
      state.products.find((p) => t.includes(p.name.toLowerCase()) || t.includes(p.sku.toLowerCase())) ??
      (/hoodie/.test(t) && /blue/.test(t)
        ? state.products[0]
        : /tee|t-shirt|shirt/.test(t) && /red/.test(t)
          ? state.products[3]
          : /cap|hat/.test(t)
            ? state.products[4]
            : /tote|bag/.test(t)
              ? state.products[5]
              : state.products[0])
    const vendor = state.vendors.find((v) => t.includes(v.name.toLowerCase().split(' ')[0])) ?? state.vendors[0]
    const openPO = state.purchaseOrders.find(
      (po) => po.status === 'sent' && po.vendorId === vendor.id && po.lines.some((l) => l.productId === product.id),
    )
    return {
      intent: 'inventory_receipt',
      intentLabel: 'Inventory receipt',
      module: 'Inventory',
      confidence: openPO ? 0.95 : 0.82,
      stakes: 'low',
      explanation: openPO
        ? `Detected goods received. Matched against open ${openPO.id} from ${vendor.name} — will draft the receipt against it and push the stock change to Shopify.`
        : 'Detected goods received. No open PO matched — will log as a standalone receipt and push the stock change to Shopify.',
      fields: [
        { label: 'Product', value: `${product.name} (${product.sku})` },
        { label: 'Quantity', value: `+${qty}` },
        { label: 'Vendor', value: vendor.name },
        { label: 'Matched PO', value: openPO ? openPO.id : 'None (standalone receipt)' },
        { label: 'Shopify', value: 'inventoryAdjustQuantities push on confirm' },
      ],
      payload: { productId: product.id, qty, vendorId: vendor.id, poId: openPO?.id ?? '' },
    }
  }

  // --- Fallback: note / ticket ---
  return {
    intent: 'note_ticket',
    intentLabel: 'Internal note / ticket',
    module: 'Collab',
    confidence: 0.55,
    stakes: 'low',
    explanation: 'Could not confidently match an inventory, finance, inbox, or R&D intent — will file as an internal ticket so nothing gets lost. You can re-route it from there.',
    fields: [
      { label: 'Ticket title', value: text.slice(0, 60) },
      { label: 'Status', value: 'open' },
    ],
    payload: { title: text.slice(0, 60), body: text },
  }
}

export const captureExamples = [
  'Received 50 blue hoodies from Acme',
  'Forwarded invoice from Pacific Trims for $560',
  'Paid $18.40 for courier shipping to Uber',
  'Customer asking if the red one is back in stock',
  'Sample arrived from Kyoto Fabric Lab — corduroy swatch',
  'Remember to renew the domain next month',
]
