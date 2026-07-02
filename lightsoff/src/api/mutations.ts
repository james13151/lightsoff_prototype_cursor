import { apiFetch } from './client'

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
  data: { name: string; leadTimeDays?: number; contactEmail?: string },
) {
  return post(token, '/v1/vendors', {
    tenant_id: tenantId,
    name: data.name,
    lead_time_days: data.leadTimeDays,
    contact_email: data.contactEmail,
  })
}

export async function createProduct(
  token: string,
  tenantId: string,
  data: {
    title: string
    sku: string
    variantTitle?: string
    price?: number
    unitCost?: number
    reorderPoint?: number
  },
) {
  return post(token, '/v1/products', {
    tenant_id: tenantId,
    title: data.title,
    variants: [{
      sku: data.sku,
      title: data.variantTitle,
      price: data.price,
      unit_cost: data.unitCost,
      reorder_point: data.reorderPoint,
    }],
  })
}

export async function createPurchaseOrder(
  token: string,
  tenantId: string,
  data: { vendorId: string; lines: { variantId: string; qty: number; unitCost?: number }[]; notes?: string; send?: boolean },
) {
  const po = await post(token, '/v1/purchase-orders', {
    tenant_id: tenantId,
    vendor_id: data.vendorId,
    source: 'manual',
    notes: data.notes,
    lines: data.lines.map((l) => ({
      variant_id: l.variantId,
      qty: l.qty,
      unit_cost: l.unitCost,
    })),
  })
  if (data.send) {
    await post(token, `/v1/purchase-orders/${po.id}/send`, {})
  }
  return po
}

export async function createReceipt(
  token: string,
  tenantId: string,
  data: {
    vendorId: string
    poId?: string
    type?: 'commercial' | 'sample'
    lines: { variantId?: string; description?: string; qty: number; poLineItemId?: string }[]
    notes?: string
  },
) {
  return post(token, '/v1/receipts', {
    tenant_id: tenantId,
    vendor_id: data.vendorId,
    po_id: data.poId,
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
  data: { variantId: string; qtyDelta: number; memo?: string },
) {
  return post(token, '/v1/inventory-adjustments', {
    tenant_id: tenantId,
    variant_id: data.variantId,
    qty_delta: data.qtyDelta,
    memo: data.memo,
  })
}

export async function createBill(
  token: string,
  tenantId: string,
  data: {
    vendorId: string
    amount: number
    dueDate?: string
    billNumber?: string
    memo?: string
    poId?: string
    expenseAccountCode?: string
  },
) {
  return post(token, '/v1/bills', {
    tenant_id: tenantId,
    vendor_id: data.vendorId,
    amount: data.amount,
    due_date: data.dueDate,
    bill_number: data.billNumber,
    memo: data.memo,
    po_id: data.poId,
    expense_account_code: data.expenseAccountCode,
  })
}

export async function recordPayment(
  token: string,
  tenantId: string,
  data: { vendorId: string; amount: number; billId: string; method?: string; memo?: string },
) {
  return post(token, '/v1/payments', {
    tenant_id: tenantId,
    vendor_id: data.vendorId,
    amount: data.amount,
    method: data.method,
    memo: data.memo,
    allocations: [{ bill_id: data.billId, amount: data.amount }],
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
