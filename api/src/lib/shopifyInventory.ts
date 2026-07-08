import { withUser } from '../db.js'
import {
  adjustShopifyInventory,
  fetchShopifyLocations,
  getPrimaryShopifyLocationId,
  normalizeShop,
  type ShopifyCredential,
} from './shopify.js'

export async function loadShopifyCred(userId: string, tenantId: string): Promise<ShopifyCredential | null> {
  try {
    return await withUser(userId, async (db) => {
      const r = await db.query(`select app.reveal_provider_credential($1, 'shopify') as secret`, [tenantId])
      const secret = r.rows[0]?.secret as { shop?: string; access_token?: string; scope?: string } | null
      if (!secret?.shop || !secret?.access_token) return null
      return { shop: normalizeShop(secret.shop), access_token: secret.access_token, scope: secret.scope }
    })
  } catch {
    return null
  }
}

interface VariantPushRow {
  variant_id: string
  shopify_inventory_item_id: number | null
  shopify_location_id: number | null
}

async function resolveLocationId(
  userId: string,
  tenantId: string,
  cred: ShopifyCredential,
  warehouseId?: string | null,
): Promise<number> {
  if (warehouseId) {
    const whLoc = await withUser(userId, async (db) => {
      const r = await db.query(
        `select shopify_location_id from app.warehouses where id = $1 and tenant_id = $2`,
        [warehouseId, tenantId],
      )
      return r.rows[0]?.shopify_location_id as number | null
    })
    if (whLoc) return Number(whLoc)
  }
  return getPrimaryShopifyLocationId(cred)
}

export async function pushInventoryDeltaToShopify(opts: {
  userId: string
  tenantId: string
  variantId: string
  qtyDelta: number
  reason: string
  refType?: string
  refId?: string
  warehouseId?: string | null
}): Promise<{ pushed: boolean; skipped?: string; error?: string }> {
  const { userId, tenantId, variantId, qtyDelta, reason, refType, refId, warehouseId } = opts
  if (qtyDelta === 0) return { pushed: false, skipped: 'zero delta' }

  const cred = await loadShopifyCred(userId, tenantId)
  if (!cred) return { pushed: false, skipped: 'shopify not connected' }

  const variant = await withUser(userId, async (db) => {
    const r = await db.query<VariantPushRow>(
      `select v.id as variant_id, v.shopify_inventory_item_id,
              w.shopify_location_id
         from app.variants v
         left join app.warehouses w on w.id = coalesce($3, app.default_warehouse_id($2))
        where v.id = $1 and v.tenant_id = $2`,
      [variantId, tenantId, warehouseId ?? null],
    )
    return r.rows[0]
  })

  if (!variant?.shopify_inventory_item_id) {
    await recordPush(userId, tenantId, variantId, 0, 0, qtyDelta, reason, refType, refId, 'skipped', 'variant not linked to Shopify')
    return { pushed: false, skipped: 'variant not linked to Shopify' }
  }

  try {
    const locationId = variant.shopify_location_id
      ? Number(variant.shopify_location_id)
      : await resolveLocationId(userId, tenantId, cred, warehouseId)

    await adjustShopifyInventory(cred, Number(variant.shopify_inventory_item_id), locationId, qtyDelta)
    await recordPush(userId, tenantId, variantId, Number(variant.shopify_inventory_item_id), locationId, qtyDelta, reason, refType, refId, 'synced')
    return { pushed: true }
  } catch (err) {
    const message = (err as Error).message
    await recordPush(userId, tenantId, variantId, Number(variant.shopify_inventory_item_id), 0, qtyDelta, reason, refType, refId, 'failed', message)
    return { pushed: false, error: message }
  }
}

export async function pushReceiptInventoryToShopify(
  userId: string,
  tenantId: string,
  receiptId: string,
): Promise<{ pushed: number; failed: number }> {
  const cred = await loadShopifyCred(userId, tenantId)
  if (!cred) return { pushed: 0, failed: 0 }

  const lines = await withUser(userId, async (db) => {
    const r = await db.query<{ variant_id: string; qty: number; warehouse_id: string | null }>(
      `select rli.variant_id, rli.qty, r.warehouse_id
         from app.receipt_line_items rli
         join app.receipts r on r.id = rli.receipt_id
        where rli.receipt_id = $1 and rli.variant_id is not null`,
      [receiptId],
    )
    return r.rows
  })

  let pushed = 0
  let failed = 0
  for (const line of lines) {
    const result = await pushInventoryDeltaToShopify({
      userId,
      tenantId,
      variantId: line.variant_id,
      qtyDelta: line.qty,
      reason: 'po_receipt',
      refType: 'receipt',
      refId: receiptId,
      warehouseId: line.warehouse_id,
    })
    if (result.pushed) pushed++
    else if (result.error) failed++
  }
  return { pushed, failed }
}

async function recordPush(
  userId: string,
  tenantId: string,
  variantId: string,
  inventoryItemId: number,
  locationId: number,
  qtyDelta: number,
  reason: string,
  refType: string | undefined,
  refId: string | undefined,
  status: string,
  error?: string,
) {
  await withUser(userId, async (db) => {
    await db.query(
      `select app.record_shopify_inventory_push($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        tenantId,
        variantId,
        inventoryItemId || 0,
        locationId || 0,
        qtyDelta,
        reason,
        refType ?? null,
        refId ?? null,
        status,
        error ?? null,
      ],
    )
  })
}

/** Cache primary Shopify location on default warehouse after OAuth connect. */
export async function syncShopifyLocationsToWarehouses(userId: string, tenantId: string): Promise<number> {
  const cred = await loadShopifyCred(userId, tenantId)
  if (!cred) return 0
  const locations = await fetchShopifyLocations(cred)
  let updated = 0
  for (const loc of locations.filter((l) => l.active)) {
    const matched = await withUser(userId, async (db) => {
      const r = await db.query(
        `update app.warehouses set shopify_location_id = $3
          where tenant_id = $1
            and (
              (is_default and $4::boolean)
              or lower(name) = lower($2)
              or lower(code) = lower($2)
            )
          returning id`,
        [tenantId, loc.name, loc.id, loc.primary ?? false],
      )
      return r.rowCount ?? 0
    })
    updated += matched
  }
  if (updated === 0 && locations[0]) {
    await withUser(userId, async (db) => {
      await db.query(
        `update app.warehouses set shopify_location_id = $2
          where tenant_id = $1 and is_default`,
        [tenantId, locations[0].id],
      )
    })
    updated = 1
  }
  return updated
}
