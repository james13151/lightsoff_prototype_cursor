import { createHmac, timingSafeEqual } from 'node:crypto'

export const SHOPIFY_API_VERSION = '2024-10'

export interface ShopifyCredential {
  shop: string
  access_token: string
  scope?: string
}

export function normalizeShop(shop: string): string {
  const trimmed = shop.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (trimmed.endsWith('.myshopify.com')) return trimmed
  return `${trimmed}.myshopify.com`
}

export function shopAdminUrl(shop: string, path: string): string {
  const base = normalizeShop(shop)
  const p = path.startsWith('/') ? path : `/${path}`
  return `https://${base}/admin/api/${SHOPIFY_API_VERSION}${p}`
}

export async function shopifyFetch<T>(
  cred: ShopifyCredential,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(shopAdminUrl(cred.shop, path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': cred.access_token,
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  if (!res.ok) {
    const msg = typeof body === 'object' && body && 'errors' in body
      ? JSON.stringify((body as { errors: unknown }).errors)
      : text || res.statusText
    throw new Error(`Shopify API ${res.status}: ${msg}`)
  }
  return body as T
}

export function verifyShopifyWebhookHmac(rawBody: string, hmacHeader: string | undefined, secret: string): boolean {
  if (!hmacHeader || !secret) return false
  const digest = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader))
  } catch {
    return false
  }
}

export interface ShopifyOrder {
  id: number
  name?: string
  order_number?: number
  financial_status?: string
  fulfillment_status?: string | null
  currency?: string
  total_price?: string
  created_at?: string
  cancelled_at?: string | null
  customer?: { email?: string; first_name?: string; last_name?: string }
  line_items?: {
    id: number
    variant_id?: number | null
    sku?: string
    title?: string
    name?: string
    quantity: number
    price?: string
  }[]
}

export interface ShopifyProduct {
  id: number
  title: string
  body_html?: string
  vendor?: string
  product_type?: string
  variants: {
    id: number
    sku?: string
    title?: string
    price?: string
    inventory_item_id?: number
    barcode?: string
    weight?: number
    weight_unit?: string
  }[]
}

export async function fetchShopifyOrders(cred: ShopifyCredential, params?: { status?: string; limit?: number }) {
  const qs = new URLSearchParams({
    status: params?.status ?? 'any',
    limit: String(params?.limit ?? 50),
  })
  const data = await shopifyFetch<{ orders: ShopifyOrder[] }>(cred, `/orders.json?${qs}`)
  return data.orders ?? []
}

export async function fetchShopifyProducts(cred: ShopifyCredential, limit = 50) {
  const data = await shopifyFetch<{ products: ShopifyProduct[] }>(cred, `/products.json?limit=${limit}`)
  return data.products ?? []
}

export interface ShopifyLocation {
  id: number
  name: string
  active: boolean
  primary?: boolean
}

export async function fetchShopifyLocations(cred: ShopifyCredential): Promise<ShopifyLocation[]> {
  const data = await shopifyFetch<{ locations: ShopifyLocation[] }>(cred, '/locations.json')
  return data.locations ?? []
}

export async function getPrimaryShopifyLocationId(cred: ShopifyCredential): Promise<number> {
  const locations = await fetchShopifyLocations(cred)
  const primary = locations.find((l) => l.primary) ?? locations.find((l) => l.active)
  if (!primary) throw new Error('No active Shopify location found')
  return primary.id
}

/** Push a relative inventory change to Shopify (LightsOff is stock SoR). */
export async function adjustShopifyInventory(
  cred: ShopifyCredential,
  inventoryItemId: number,
  locationId: number,
  availableAdjustment: number,
) {
  if (availableAdjustment === 0) return
  await shopifyFetch(cred, '/inventory_levels/adjust.json', {
    method: 'POST',
    body: JSON.stringify({
      location_id: locationId,
      inventory_item_id: inventoryItemId,
      available_adjustment: availableAdjustment,
    }),
  })
}

export async function registerShopifyWebhooks(cred: ShopifyCredential, callbackUrl: string) {
  const topics = ['orders/create', 'orders/updated', 'orders/paid', 'orders/cancelled']
  const results: { topic: string; id?: number; error?: string }[] = []
  for (const topic of topics) {
    try {
      const data = await shopifyFetch<{ webhook: { id: number } }>(cred, '/webhooks.json', {
        method: 'POST',
        body: JSON.stringify({
          webhook: { topic, address: callbackUrl, format: 'json' },
        }),
      })
      results.push({ topic, id: data.webhook?.id })
    } catch (err) {
      results.push({ topic, error: (err as Error).message })
    }
  }
  return results
}

export async function createShopifyFulfillment(
  cred: ShopifyCredential,
  shopifyOrderId: number,
  tracking: { company?: string; number?: string; url?: string },
) {
  const foData = await shopifyFetch<{
    fulfillment_orders: { id: number; status: string; line_items: { id: number; quantity: number }[] }[]
  }>(cred, `/orders/${shopifyOrderId}/fulfillment_orders.json`)

  const open = (foData.fulfillment_orders ?? []).filter((fo) => fo.status === 'open' || fo.status === 'in_progress')
  if (open.length === 0) {
    throw new Error('No open fulfillment orders for this Shopify order')
  }

  const payload = {
    fulfillment: {
      notify_customer: true,
      tracking_info: {
        company: tracking.company ?? undefined,
        number: tracking.number ?? undefined,
        url: tracking.url ?? undefined,
      },
      line_items_by_fulfillment_order: open.map((fo) => ({
        fulfillment_order_id: fo.id,
        fulfillment_order_line_items: fo.line_items.map((li) => ({
          id: li.id,
          quantity: li.quantity,
        })),
      })),
    },
  }

  const data = await shopifyFetch<{ fulfillment: { id: number } }>(cred, '/fulfillments.json', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return data.fulfillment
}
