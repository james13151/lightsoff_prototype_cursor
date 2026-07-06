import type { FastifyInstance, FastifyRequest } from 'fastify'
import { withEncryptionKey, withUser } from '../db.js'
import { env } from '../env.js'
import {
  createShopifyFulfillment,
  fetchShopifyOrders,
  fetchShopifyProducts,
  normalizeShop,
  registerShopifyWebhooks,
  verifyShopifyWebhookHmac,
} from '../lib/shopify.js'
import {
  buildShopifyInstallUrl,
  createOAuthState,
  exchangeShopifyOAuthCode,
  parseOAuthState,
  shopifyOAuthErrorRedirect,
  shopifyOAuthSuccessRedirect,
} from '../lib/shopifyOAuth.js'
import { loadShopifyCred, syncShopifyLocationsToWarehouses } from '../lib/shopifyInventory.js'

function isRlsViolation(err: unknown): boolean {
  return (err as { code?: string }).code === '42501'
}

async function requireShopifyCred(userId: string, tenantId: string) {
  const cred = await loadShopifyCred(userId, tenantId)
  if (!cred) throw new Error('Shopify not connected')
  return cred
}

export function shopifyRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { tenant_id?: string } }>('/v1/shopify/status', async (req, reply) => {
    const { tenant_id } = req.query
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    return withUser(req.userId, async (db) => {
      const cred = await db.query(
        `select id, label, created_at, updated_at from app.integration_credentials
          where tenant_id = $1 and provider = 'shopify' order by updated_at desc limit 1`,
        [tenant_id],
      )
      const row = cred.rows[0]
      if (!row) return { connected: false, oauth_available: Boolean(env.shopifyApiKey && env.shopifyApiSecret && env.apiPublicUrl) }
      let shop: string | null = null
      try {
        const secret = await db.query(`select app.reveal_provider_credential($1, 'shopify') as secret`, [tenant_id])
        shop = (secret.rows[0]?.secret as { shop?: string })?.shop ?? null
      } catch { /* member without access */ }
      return {
        connected: true,
        credential_id: row.id,
        label: row.label,
        shop,
        oauth_available: Boolean(env.shopifyApiKey && env.shopifyApiSecret && env.apiPublicUrl),
        webhook_url: env.apiPublicUrl ? `${env.apiPublicUrl.replace(/\/$/, '')}/v1/webhooks/shopify` : null,
        updated_at: row.updated_at,
      }
    })
  })

  app.post<{
    Body: { tenant_id: string; shop: string; access_token: string; label?: string }
  }>('/v1/shopify/connect', async (req, reply) => {
    const { tenant_id, shop, access_token, label } = req.body ?? {}
    if (!tenant_id || !shop?.trim() || !access_token?.trim()) {
      return reply.code(400).send({ error: 'tenant_id, shop, and access_token are required' })
    }
    const normalized = normalizeShop(shop)
    try {
      const id = await withUser(req.userId, async (db) => {
        const r = await db.query('select app.store_credential($1, $2, $3, $4) as id', [
          tenant_id,
          'shopify',
          label ?? 'main-store',
          JSON.stringify({ shop: normalized, access_token: access_token.trim() }),
        ])
        return r.rows[0].id as string
      })
      await syncShopifyLocationsToWarehouses(req.userId, tenant_id)
      return reply.code(201).send({ id, shop: normalized })
    } catch (err) {
      const message = (err as Error).message ?? ''
      if (message.includes('admin role required')) return reply.code(403).send({ error: 'admin role required' })
      throw err
    }
  })

  app.get<{ Querystring: { tenant_id?: string; shop?: string } }>(
    '/v1/shopify/oauth/install-url',
    async (req, reply) => {
      const { tenant_id, shop } = req.query
      if (!tenant_id || !shop?.trim()) {
        return reply.code(400).send({ error: 'tenant_id and shop are required' })
      }
      if (!env.shopifyApiKey || !env.shopifyApiSecret || !env.apiPublicUrl) {
        return reply.code(400).send({
          error: 'Shopify OAuth is not configured on the server (SHOPIFY_API_KEY, SHOPIFY_API_SECRET, API_PUBLIC_URL)',
        })
      }
      try {
        const state = createOAuthState(tenant_id, req.userId, shop)
        return { install_url: buildShopifyInstallUrl(shop, state), shop: normalizeShop(shop) }
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    },
  )

  app.post<{ Body: { tenant_id: string } }>('/v1/shopify/register-webhooks', async (req, reply) => {
    const { tenant_id } = req.body ?? {}
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    if (!env.apiPublicUrl) {
      return reply.code(400).send({ error: 'API_PUBLIC_URL is not configured on the server' })
    }
    try {
      const cred = await requireShopifyCred(req.userId, tenant_id)
      const callbackUrl = `${env.apiPublicUrl.replace(/\/$/, '')}/v1/webhooks/shopify`
      const results = await registerShopifyWebhooks(cred, callbackUrl)
      return { callback_url: callbackUrl, results }
    } catch (err) {
      const message = (err as Error).message ?? ''
      if (message === 'Shopify not connected') return reply.code(404).send({ error: message })
      throw err
    }
  })

  app.post<{ Body: { tenant_id: string } }>('/v1/shopify/sync/products', async (req, reply) => {
    const { tenant_id } = req.body ?? {}
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    try {
      const cred = await requireShopifyCred(req.userId, tenant_id)
      const products = await fetchShopifyProducts(cred, 100)
      const summary = await withUser(req.userId, async (db) => {
        let upserted = 0
        for (const p of products) {
          const existing = await db.query(
            `select id from app.products where tenant_id = $1 and shopify_product_id = $2`,
            [tenant_id, p.id],
          )
          let productId = existing.rows[0]?.id as string | undefined
          if (!productId) {
            const ins = await db.query(
              `insert into app.products (tenant_id, title, description, brand, product_type, shopify_product_id)
               values ($1, $2, $3, $4, $5, $6) returning id`,
              [tenant_id, p.title, p.body_html ?? null, p.vendor ?? null, p.product_type ?? null, p.id],
            )
            productId = ins.rows[0].id
          } else {
            await db.query(
              `update app.products set title = $2, description = $3, brand = $4, product_type = $5, updated_at = now() where id = $1`,
              [productId, p.title, p.body_html ?? null, p.vendor ?? null, p.product_type ?? null],
            )
          }
          for (const v of p.variants ?? []) {
            await db.query(
              `insert into app.variants (
                 tenant_id, product_id, sku, title, price, shopify_variant_id, shopify_inventory_item_id, barcode, weight, weight_unit
               ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
               on conflict (tenant_id, shopify_variant_id) do update set
                 sku = excluded.sku,
                 title = excluded.title,
                 price = excluded.price,
                 shopify_inventory_item_id = excluded.shopify_inventory_item_id,
                 barcode = excluded.barcode,
                 weight = excluded.weight,
                 weight_unit = excluded.weight_unit,
                 updated_at = now()`,
              [
                tenant_id,
                productId,
                v.sku || `SHOPIFY-${v.id}`,
                v.title ?? null,
                v.price ? Number(v.price) : null,
                v.id,
                v.inventory_item_id ?? null,
                v.barcode ?? null,
                v.weight ?? null,
                v.weight_unit ?? null,
              ],
            )
          }
          upserted++
        }
        await db.query('select app.emit_event($1, $2, $3)', [
          tenant_id,
          'shopify.products.synced',
          JSON.stringify({ count: upserted }),
        ])
        return { products: upserted, variants: products.reduce((n, p) => n + (p.variants?.length ?? 0), 0) }
      })
      return summary
    } catch (err) {
      if (isRlsViolation(err)) return reply.code(403).send({ error: 'not a member of this tenant' })
      const message = (err as Error).message ?? ''
      if (message === 'Shopify not connected') return reply.code(404).send({ error: message })
      throw err
    }
  })

  app.post<{ Body: { tenant_id: string; limit?: number } }>('/v1/shopify/sync/orders', async (req, reply) => {
    const { tenant_id, limit } = req.body ?? {}
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    try {
      const cred = await requireShopifyCred(req.userId, tenant_id)
      const orders = await fetchShopifyOrders(cred, { limit: limit ?? 50 })
      const ingested = await withUser(req.userId, async (db) => {
        const ids: string[] = []
        for (const order of orders) {
          const r = await db.query(`select app.ingest_shopify_order($1, $2) as id`, [
            tenant_id,
            JSON.stringify(order),
          ])
          ids.push(r.rows[0].id)
        }
        return ids.length
      })
      return { ingested, fetched: orders.length }
    } catch (err) {
      if (isRlsViolation(err)) return reply.code(403).send({ error: 'not a member of this tenant' })
      throw err
    }
  })

  app.get<{ Querystring: { tenant_id?: string } }>('/v1/sales-orders', async (req, reply) => {
    const { tenant_id } = req.query
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    return withUser(req.userId, async (db) => {
      const r = await db.query(
        `select so.*,
                coalesce(jsonb_agg(jsonb_build_object(
                  'id', sol.id, 'sku', sol.sku, 'title', sol.title, 'qty', sol.qty,
                  'unit_price', sol.unit_price, 'variant_id', sol.variant_id,
                  'shopify_line_item_id', sol.shopify_line_item_id
                ) order by sol.created_at) filter (where sol.id is not null), '[]') as lines,
                f.id as fulfillment_id,
                f.status as ship_status,
                f.carrier,
                f.tracking_number,
                f.sync_status,
                f.sync_error
           from app.sales_orders so
           left join app.sales_order_lines sol on sol.sales_order_id = so.id
           left join app.fulfillments f on f.sales_order_id = so.id
          where so.tenant_id = $1
          group by so.id, f.id
          order by so.placed_at desc nulls last
          limit 100`,
        [tenant_id],
      )
      return r.rows
    })
  })

  app.get<{ Querystring: { tenant_id?: string; status?: string } }>('/v1/fulfillments', async (req, reply) => {
    const { tenant_id, status } = req.query
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    return withUser(req.userId, async (db) => {
      const r = await db.query(
        `select f.*, so.order_number, so.customer_name, so.customer_email, so.total_price
           from app.fulfillments f
           left join app.sales_orders so on so.id = f.sales_order_id
          where f.tenant_id = $1
            and ($2::text is null or f.status = $2)
          order by f.created_at desc
          limit 100`,
        [tenant_id, status ?? null],
      )
      return r.rows
    })
  })

  app.post<{
    Params: { id: string }
    Body: { carrier?: string; tracking_number?: string; shipped_at?: string; sync_to_shopify?: boolean }
  }>('/v1/fulfillments/:id/ship', async (req, reply) => {
    const { carrier, tracking_number, shipped_at, sync_to_shopify } = req.body ?? {}
    try {
      const fulfillment = await withUser(req.userId, async (db) => {
        const r = await db.query(
          `select * from app.mark_fulfillment_shipped($1, $2, $3, $4)`,
          [req.params.id, carrier ?? null, tracking_number ?? null, shipped_at ?? null],
        )
        return r.rows[0]
      })

      if (sync_to_shopify !== false) {
        try {
          const cred = await requireShopifyCred(req.userId, fulfillment.tenant_id)
          const shopifyFulfillment = await createShopifyFulfillment(cred, Number(fulfillment.shopify_order_id), {
            company: carrier ?? undefined,
            number: tracking_number ?? undefined,
          })
          await withUser(req.userId, async (db) => {
            await db.query('select app.mark_fulfillment_synced($1, $2)', [
              fulfillment.id,
              shopifyFulfillment.id,
            ])
          })
          fulfillment.sync_status = 'synced'
          fulfillment.shopify_fulfillment_id = shopifyFulfillment.id
        } catch (syncErr) {
          await withUser(req.userId, async (db) => {
            await db.query('select app.mark_fulfillment_sync_failed($1, $2)', [
              fulfillment.id,
              (syncErr as Error).message,
            ])
          })
          fulfillment.sync_status = 'failed'
          fulfillment.sync_error = (syncErr as Error).message
        }
      } else {
        await withUser(req.userId, async (db) => {
          await db.query(
            `update app.fulfillments set sync_status = 'not_applicable', updated_at = now() where id = $1`,
            [fulfillment.id],
          )
        })
      }

      return fulfillment
    } catch (err) {
      const message = (err as Error).message ?? ''
      if (message.includes('not found')) return reply.code(404).send({ error: message })
      if (isRlsViolation(err)) return reply.code(403).send({ error: 'not a member of this tenant' })
      throw err
    }
  })
}

/** Public webhook endpoint — registered outside authed scope. */
export async function handleShopifyWebhook(req: FastifyRequest, rawBody: string) {
  const topic = req.headers['x-shopify-topic'] as string | undefined
  const shopDomain = req.headers['x-shopify-shop-domain'] as string | undefined
  const webhookId = req.headers['x-shopify-webhook-id'] as string | undefined
  const hmac = req.headers['x-shopify-hmac-sha256'] as string | undefined

  if (!topic || !shopDomain || !webhookId) {
    return { status: 400, body: { error: 'missing Shopify webhook headers' } }
  }

  const secret = env.shopifyApiSecret
  if (secret && !verifyShopifyWebhookHmac(rawBody, hmac, secret)) {
    return { status: 401, body: { error: 'invalid webhook signature' } }
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return { status: 400, body: { error: 'invalid json body' } }
  }

  const tenantId = await withEncryptionKey(async (db) => {
    const r = await db.query(`select app.tenant_by_shopify_domain($1) as tenant_id`, [shopDomain])
    return r.rows[0]?.tenant_id as string | undefined
  })

  if (!tenantId) {
    return { status: 404, body: { error: 'no tenant linked to this shop' } }
  }

  const orderId = await withEncryptionKey(async (db) => {
    const r = await db.query(`select app.process_shopify_webhook($1, $2, $3, $4) as order_id`, [
      tenantId,
      topic,
      webhookId,
      JSON.stringify(payload),
    ])
    return r.rows[0]?.order_id as string | null
  })

  return { status: 200, body: { ok: true, order_id: orderId, duplicate: orderId === null && topic.startsWith('orders/') } }
}

/** Public OAuth callback — exchange code and store credential. */
export async function handleShopifyOAuthCallback(query: {
  code?: string
  shop?: string
  state?: string
  error?: string
  error_description?: string
}): Promise<{ redirect: string }> {
  if (query.error) {
    return { redirect: shopifyOAuthErrorRedirect(query.error_description ?? query.error) }
  }
  const { code, shop, state } = query
  if (!code || !shop || !state) {
    return { redirect: shopifyOAuthErrorRedirect('Missing code, shop, or state') }
  }
  try {
    const parsed = parseOAuthState(state)
    const normalized = normalizeShop(shop)
    if (normalizeShop(parsed.shop) !== normalized) {
      throw new Error('shop mismatch in oauth callback')
    }
    const token = await exchangeShopifyOAuthCode(normalized, code)
    await withUser(parsed.userId, async (db) => {
      await db.query('select app.store_credential($1, $2, $3, $4)', [
        parsed.tenantId,
        'shopify',
        'oauth-store',
        JSON.stringify({
          shop: normalized,
          access_token: token.access_token,
          scope: token.scope,
        }),
      ])
    })
    await syncShopifyLocationsToWarehouses(parsed.userId, parsed.tenantId)
    if (env.apiPublicUrl) {
      const cred = await loadShopifyCred(parsed.userId, parsed.tenantId)
      if (cred) {
        const callbackUrl = `${env.apiPublicUrl.replace(/\/$/, '')}/v1/webhooks/shopify`
        await registerShopifyWebhooks(cred, callbackUrl).catch(() => {})
      }
    }
    return { redirect: shopifyOAuthSuccessRedirect(normalized) }
  } catch (err) {
    return { redirect: shopifyOAuthErrorRedirect((err as Error).message) }
  }
}
