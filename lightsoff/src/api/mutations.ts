import { apiFetch } from './client'
import { cartesianProduct, variantSku, variantTitle } from '../lib/matrix'
import type { POLineItem, VendorBillLine } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

const post = (token: string, path: string, body: unknown) =>
  apiFetch<Row>(path, { method: 'POST', token, body: JSON.stringify(body) })

export interface AccountOption {
  id: string
  code: string
  name: string
  type: string
}

export async function fetchAccounts(token: string, tenantId: string): Promise<AccountOption[]> {
  const rows = await apiFetch<Row[]>(`/v1/accounts?tenant_id=${tenantId}`, { token })
  return rows.map((a) => ({
    id: a.id ?? a.account_id,
    code: a.code,
    name: a.name,
    type: a.type,
  }))
}

export async function createVendor(
  token: string,
  tenantId: string,
  data: {
    name: string
    leadTimeDays?: number
    contactEmail?: string
    phone?: string
    paymentTerms?: string
    notes?: string
    isRecurring?: boolean
  },
) {
  return post(token, '/v1/vendors', {
    tenant_id: tenantId,
    name: data.name,
    lead_time_days: data.leadTimeDays,
    contact_email: data.contactEmail,
    phone: data.phone,
    payment_terms: data.paymentTerms,
    notes: data.notes,
    is_recurring: data.isRecurring,
  })
}

export async function createProduct(
  token: string,
  tenantId: string,
  data: {
    title: string
    description?: string
    brand?: string
    productType?: string
    defaultVendorId?: string
    customAttributes?: Record<string, unknown>
    baseSku: string
    options?: { name: string; values: string[] }[]
    price?: number
    unitCost?: number
    reorderPoint?: number
    variants?: {
      sku: string
      title?: string
      optionValues?: Record<string, string>
      price?: number
      unitCost?: number
      reorderPoint?: number
      barcode?: string
    }[]
  },
) {
  const options = (data.options ?? []).filter((o) => o.name.trim() && o.values.length > 0)
  let variants = data.variants
  if (!variants?.length) {
    const combos = options.length ? cartesianProduct(options) : [{}]
    variants = combos.map((ov) => ({
      sku: variantSku(data.baseSku, ov),
      title: Object.keys(ov).length ? variantTitle(ov) : undefined,
      optionValues: ov,
      price: data.price,
      unitCost: data.unitCost,
      reorderPoint: data.reorderPoint,
    }))
  }
  return post(token, '/v1/products', {
    tenant_id: tenantId,
    title: data.title,
    description: data.description,
    brand: data.brand,
    product_type: data.productType,
    default_vendor_id: data.defaultVendorId,
    custom_attributes: data.customAttributes,
    options: options.map((o) => ({ name: o.name, values: o.values })),
    variants: variants.map((v) => ({
      sku: v.sku,
      title: v.title,
      price: v.price,
      unit_cost: v.unitCost,
      reorder_point: v.reorderPoint,
      barcode: v.barcode,
      option_values: v.optionValues,
    })),
  })
}

export async function createPurchaseOrder(
  token: string,
  tenantId: string,
  data: {
    vendorId: string
    lines: POLineItem[]
    notes?: string
    poNumber?: string
    expectedAt?: string
    send?: boolean
  },
) {
  const po = await post(token, '/v1/purchase-orders', {
    tenant_id: tenantId,
    vendor_id: data.vendorId,
    source: 'manual',
    notes: data.notes,
    po_number: data.poNumber,
    expected_at: data.expectedAt,
    lines: data.lines.map((l) => ({
      variant_id: l.productId,
      description: l.description,
      qty: l.qty,
      unit_cost: l.unitCost,
    })),
  })
  if (data.send) {
    await post(token, `/v1/purchase-orders/${po.id}/send`, {})
  }
  return po
}

export async function createWarehouse(
  token: string,
  tenantId: string,
  data: {
    code: string
    name: string
    isDefault?: boolean
    contactName?: string
    contactEmail?: string
    contactPhone?: string
    address?: {
      line1?: string
      line2?: string
      city?: string
      state?: string
      postalCode?: string
      country?: string
    }
  },
) {
  return post(token, '/v1/warehouses', {
    tenant_id: tenantId,
    code: data.code,
    name: data.name,
    is_default: data.isDefault,
    contact_name: data.contactName,
    contact_email: data.contactEmail,
    contact_phone: data.contactPhone,
    address: data.address ? {
      line1: data.address.line1,
      line2: data.address.line2,
      city: data.address.city,
      state: data.address.state,
      postal_code: data.address.postalCode,
      country: data.address.country,
    } : undefined,
  })
}

export async function createReceipt(
  token: string,
  tenantId: string,
  data: {
    vendorId: string
    poId?: string
    warehouseId?: string
    type?: 'commercial' | 'sample'
    lines: { variantId?: string; description?: string; qty: number; poLineItemId?: string }[]
    notes?: string
  },
) {
  return post(token, '/v1/receipts', {
    tenant_id: tenantId,
    vendor_id: data.vendorId,
    po_id: data.poId,
    warehouse_id: data.warehouseId,
    type: data.type ?? 'commercial',
    notes: data.notes,
    lines: data.lines.map((l) => ({
      variant_id: l.variantId,
      description: l.description,
      qty: l.qty,
      po_line_item_id: l.poLineItemId,
    })),
  })
}

export async function adjustInventory(
  token: string,
  tenantId: string,
  data: { variantId: string; qtyDelta: number; warehouseId?: string; memo?: string },
) {
  return post(token, '/v1/inventory-adjustments', {
    tenant_id: tenantId,
    variant_id: data.variantId,
    qty_delta: data.qtyDelta,
    warehouse_id: data.warehouseId,
    memo: data.memo,
  })
}

export async function createBill(
  token: string,
  tenantId: string,
  data: {
    vendorId: string
    lines: VendorBillLine[]
    billNumber?: string
    poId?: string
    receiptId?: string
    dueDate?: string
    memo?: string
    expenseAccountCode?: string
  },
) {
  return post(token, '/v1/bills', {
    tenant_id: tenantId,
    vendor_id: data.vendorId,
    bill_number: data.billNumber,
    po_id: data.poId,
    receipt_id: data.receiptId,
    due_date: data.dueDate,
    memo: data.memo,
    expense_account_code: data.expenseAccountCode,
    lines: data.lines.map((l) => ({
      variant_id: l.productId,
      description: l.description,
      qty: l.qty,
      unit_cost: l.unitCost,
      line_amount: l.lineAmount,
      po_line_item_id: l.poLineItemId,
      receipt_line_item_id: l.receiptLineItemId,
    })),
  })
}

export async function recordPayment(
  token: string,
  tenantId: string,
  data: {
    vendorId: string
    amount: number
    allocations: { billId: string; amount: number }[]
    method?: string
    memo?: string
  },
) {
  return post(token, '/v1/payments', {
    tenant_id: tenantId,
    vendor_id: data.vendorId,
    amount: data.amount,
    method: data.method,
    memo: data.memo,
    allocations: data.allocations.map((a) => ({ bill_id: a.billId, amount: a.amount })),
  })
}

export async function createExpenseClaim(
  token: string,
  tenantId: string,
  data: { vendorName: string; amount: number; categoryAccountCode: string; notes?: string; autoApprove?: boolean },
) {
  const claim = await post(token, '/v1/expense-claims', {
    tenant_id: tenantId,
    vendor_name: data.vendorName,
    amount: data.amount,
    category_account_code: data.categoryAccountCode,
    source: 'manual',
    notes: data.notes,
  })
  if (data.autoApprove) {
    await post(token, `/v1/expense-claims/${claim.id}/approve`, {})
  }
  return claim
}

export async function createJournalEntry(
  token: string,
  tenantId: string,
  data: { memo: string; lines: { accountCode: string; debit?: number; credit?: number }[] },
) {
  return post(token, '/v1/journal', {
    tenant_id: tenantId,
    memo: data.memo,
    lines: data.lines.map((l) => ({
      account_code: l.accountCode,
      debit: l.debit ?? 0,
      credit: l.credit ?? 0,
    })),
  })
}

export const EXPENSE_CATEGORIES = [
  { label: 'Shipping & Freight', code: '6100' },
  { label: 'Software', code: '6200' },
  { label: 'Meals & Entertainment', code: '6300' },
  { label: 'General Expense', code: '6900' },
  { label: 'Advertising', code: '6000' },
  { label: 'Cost of Goods Sold', code: '5000' },
] as const
