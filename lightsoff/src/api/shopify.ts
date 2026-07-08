import { apiFetch } from './client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

const post = (token: string, path: string, body: unknown) =>
  apiFetch<Row>(path, { method: 'POST', token, body: JSON.stringify(body) })

export interface ShopifyStatus {
  connected: boolean
  oauth_available?: boolean
  credential_id?: string
  label?: string
  shop?: string | null
  webhook_url?: string | null
  updated_at?: string
}

export interface SalesOrderLine {
  id: string
  sku?: string
  title: string
  qty: number
  unit_price: number
  variant_id?: string
  shopify_line_item_id: number
}

export interface SalesOrder {
  id: string
  shopify_order_id: number
  order_number?: string
  financial_status?: string
  fulfillment_status?: string
  customer_email?: string
  customer_name?: string
  total_price: number
  currency: string
  placed_at?: string
  stock_reserved_at?: string
  lines: SalesOrderLine[]
  fulfillment_id?: string
  ship_status?: string
  carrier?: string
  tracking_number?: string
  sync_status?: string
  sync_error?: string
}

export async function fetchShopifyStatus(token: string, tenantId: string): Promise<ShopifyStatus> {
  return apiFetch<ShopifyStatus>(`/v1/shopify/status?tenant_id=${tenantId}`, { token })
}

export async function connectShopify(
  token: string,
  tenantId: string,
  data: { shop: string; access_token: string; label?: string },
) {
  return post(token, '/v1/shopify/connect', { tenant_id: tenantId, ...data })
}

export async function getShopifyOAuthInstallUrl(token: string, tenantId: string, shop: string) {
  const qs = new URLSearchParams({ tenant_id: tenantId, shop })
  return apiFetch<{ install_url: string; shop: string }>(`/v1/shopify/oauth/install-url?${qs}`, { token })
}

export async function registerShopifyWebhooks(token: string, tenantId: string) {
  return post(token, '/v1/shopify/register-webhooks', { tenant_id: tenantId })
}

export async function syncShopifyProducts(token: string, tenantId: string) {
  return post(token, '/v1/shopify/sync/products', { tenant_id: tenantId })
}

export async function syncShopifyOrders(token: string, tenantId: string, limit = 50) {
  return post(token, '/v1/shopify/sync/orders', { tenant_id: tenantId, limit })
}

export async function fetchSalesOrders(token: string, tenantId: string): Promise<SalesOrder[]> {
  const rows = await apiFetch<Row[]>(`/v1/sales-orders?tenant_id=${tenantId}`, { token })
  return rows.map((r) => ({
    id: r.id,
    shopify_order_id: Number(r.shopify_order_id),
    order_number: r.order_number,
    financial_status: r.financial_status,
    fulfillment_status: r.fulfillment_status,
    customer_email: r.customer_email,
    customer_name: r.customer_name,
    total_price: Number(r.total_price),
    currency: r.currency,
    placed_at: r.placed_at,
    stock_reserved_at: r.stock_reserved_at,
    lines: (r.lines ?? []) as SalesOrderLine[],
    fulfillment_id: r.fulfillment_id,
    ship_status: r.ship_status,
    carrier: r.carrier,
    tracking_number: r.tracking_number,
    sync_status: r.sync_status,
    sync_error: r.sync_error,
  }))
}

export async function shipFulfillment(
  token: string,
  fulfillmentId: string,
  data: { carrier?: string; tracking_number?: string; sync_to_shopify?: boolean },
) {
  return post(token, `/v1/fulfillments/${fulfillmentId}/ship`, data)
}
