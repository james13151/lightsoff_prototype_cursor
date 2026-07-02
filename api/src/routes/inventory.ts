import type { FastifyInstance } from 'fastify'
import { withUser } from '../db.js'

interface POLineInput {
  variant_id?: string
  description?: string
  qty: number
  unit_cost?: number
}

interface ReceiptLineInput {
  po_line_item_id?: string
  variant_id?: string
  description?: string
  qty: number
}

function isRlsViolation(err: unknown): boolean {
  return (err as { code?: string }).code === '42501'
}

/** Inventory & Procurement routes (spec §4.1). Registered under an authed scope. */
export function inventoryRoutes(app: FastifyInstance) {
  // ---- Products & variants (shared entities; Shopify sync upserts these
  //      by shopify_*_id later — manual creation is the fallback path) ----

  app.post<{
    Body: {
      tenant_id: string; title: string; shopify_product_id?: number
      variants: { sku: string; title?: string; price?: number; unit_cost?: number; reorder_point?: number; shopify_variant_id?: number }[]
    }
  }>('/v1/products', async (req, reply) => {
    const { tenant_id, title, shopify_product_id, variants } = req.body ?? {}
    if (!tenant_id || !title || !Array.isArray(variants) || variants.length === 0) {
      return reply.code(400).send({ error: 'tenant_id, title and at least one variant are required' })
    }
    try {
      const product = await withUser(req.userId, async (db) => {
        const r = await db.query(
          `insert into app.products (tenant_id, title, shopify_product_id)
           values ($1, $2, $3) returning *`,
          [tenant_id, title, shopify_product_id ?? null],
        )
        const created = r.rows[0]
        const createdVariants = []
        for (const v of variants) {
          const vr = await db.query(
            `insert into app.variants (tenant_id, product_id, sku, title, price, unit_cost, reorder_point, shopify_variant_id)
             values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
            [tenant_id, created.id, v.sku, v.title ?? null, v.price ?? null, v.unit_cost ?? null, v.reorder_point ?? null, v.shopify_variant_id ?? null],
          )
          createdVariants.push(vr.rows[0])
        }
        return { ...created, variants: createdVariants }
      })
      return reply.code(201).send(product)
    } catch (err) {
      if (isRlsViolation(err)) return reply.code(403).send({ error: 'not a member of this tenant' })
      throw err
    }
  })

  app.get<{ Querystring: { tenant_id?: string } }>('/v1/products', async (req, reply) => {
    const { tenant_id } = req.query
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    return withUser(req.userId, async (db) => {
      const r = await db.query(
        `select p.*, coalesce(jsonb_agg(jsonb_build_object(
                  'id', v.id, 'sku', v.sku, 'title', v.title,
                  'price', v.price, 'unit_cost', v.unit_cost, 'reorder_point', v.reorder_point
                ) order by v.sku) filter (where v.id is not null), '[]') as variants
           from app.products p
           left join app.variants v on v.product_id = p.id
          where p.tenant_id = $1
          group by p.id order by p.title`,
        [tenant_id],
      )
      return r.rows
    })
  })

  // ---- Purchase orders ----

  app.post<{
    Body: { tenant_id: string; vendor_id: string; lines: POLineInput[]; notes?: string; source?: string }
  }>('/v1/purchase-orders', async (req, reply) => {
    const { tenant_id, vendor_id, lines, notes, source } = req.body ?? {}
    if (!tenant_id || !vendor_id || !Array.isArray(lines) || lines.length === 0) {
      return reply.code(400).send({ error: 'tenant_id, vendor_id and at least one line are required' })
    }
    try {
      const po = await withUser(req.userId, async (db) => {
        const r = await db.query(
          `insert into app.purchase_orders (tenant_id, vendor_id, notes, source, created_by)
           values ($1, $2, $3, coalesce($4, 'manual'), $5) returning *`,
          [tenant_id, vendor_id, notes ?? null, source ?? null, req.userId],
        )
        const created = r.rows[0]
        for (const line of lines) {
          await db.query(
            `insert into app.po_line_items (tenant_id, po_id, variant_id, description, qty, unit_cost)
             values ($1, $2, $3, $4, $5, coalesce($6::numeric, 0))`,
            [tenant_id, created.id, line.variant_id ?? null, line.description ?? null, line.qty, line.unit_cost ?? null],
          )
        }
        return created
      })
      return reply.code(201).send(po)
    } catch (err) {
      if (isRlsViolation(err)) return reply.code(403).send({ error: 'not a member of this tenant' })
      throw err
    }
  })

  app.get<{ Querystring: { tenant_id?: string; status?: string } }>('/v1/purchase-orders', async (req, reply) => {
    const { tenant_id, status } = req.query
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    return withUser(req.userId, async (db) => {
      const r = await db.query(
        `select po.*, v.name as vendor_name,
                coalesce(jsonb_agg(jsonb_build_object(
                  'id', l.id, 'variant_id', l.variant_id, 'description', l.description,
                  'qty', l.qty, 'unit_cost', l.unit_cost
                )) filter (where l.id is not null), '[]') as lines
           from app.purchase_orders po
           join app.vendors v on v.id = po.vendor_id
           left join app.po_line_items l on l.po_id = po.id
          where po.tenant_id = $1 and ($2::app.po_status is null or po.status = $2)
          group by po.id, v.name
          order by po.created_at desc`,
        [tenant_id, status ?? null],
      )
      return r.rows
    })
  })

  app.post<{ Params: { id: string } }>('/v1/purchase-orders/:id/send', async (req, reply) => {
    const updated = await withUser(req.userId, async (db) => {
      const r = await db.query(
        `update app.purchase_orders set status = 'sent' where id = $1 and status = 'draft' returning *`,
        [req.params.id],
      )
      return r.rows[0]
    })
    if (!updated) return reply.code(404).send({ error: 'PO not found or not in draft' })
    return updated
  })

  // ---- Receipts ----
  // Creates the receipt + lines and finalizes atomically: ledger entries are
  // written, PO status rolls forward, discrepancies are flagged on the bus.

  app.post<{
    Body: { tenant_id: string; vendor_id: string; po_id?: string; type?: 'commercial' | 'sample'; lines: ReceiptLineInput[]; notes?: string }
  }>('/v1/receipts', async (req, reply) => {
    const { tenant_id, vendor_id, po_id, type, lines, notes } = req.body ?? {}
    if (!tenant_id || !vendor_id || !Array.isArray(lines) || lines.length === 0) {
      return reply.code(400).send({ error: 'tenant_id, vendor_id and at least one line are required' })
    }
    try {
      const result = await withUser(req.userId, async (db) => {
        const r = await db.query(
          `insert into app.receipts (tenant_id, po_id, vendor_id, type, notes, created_by)
           values ($1, $2, $3, coalesce($4, 'commercial')::app.receipt_type, $5, $6) returning *`,
          [tenant_id, po_id ?? null, vendor_id, type ?? null, notes ?? null, req.userId],
        )
        const receipt = r.rows[0]
        for (const line of lines) {
          await db.query(
            `insert into app.receipt_line_items (tenant_id, receipt_id, po_line_item_id, variant_id, description, qty)
             values ($1, $2, $3, $4, $5, $6)`,
            [tenant_id, receipt.id, line.po_line_item_id ?? null, line.variant_id ?? null, line.description ?? null, line.qty],
          )
        }
        await db.query('select app.finalize_receipt($1)', [receipt.id])
        const discrepancies = await db.query(
          `select payload from app.events
            where tenant_id = $1 and type = 'inventory.discrepancy_flagged'
              and payload->>'receipt_id' = $2::text`,
          [tenant_id, receipt.id],
        )
        return { ...receipt, discrepancies: discrepancies.rows.map((x) => x.payload) }
      })
      return reply.code(201).send(result)
    } catch (err) {
      if (isRlsViolation(err)) return reply.code(403).send({ error: 'not a member of this tenant' })
      throw err
    }
  })

  app.get<{ Querystring: { tenant_id?: string } }>('/v1/receipts', async (req, reply) => {
    const { tenant_id } = req.query
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    return withUser(req.userId, async (db) => {
      const r = await db.query(
        `select rc.*, v.name as vendor_name,
                coalesce(jsonb_agg(jsonb_build_object(
                  'variant_id', l.variant_id, 'description', l.description, 'qty', l.qty
                )) filter (where l.id is not null), '[]') as lines
           from app.receipts rc
           join app.vendors v on v.id = rc.vendor_id
           left join app.receipt_line_items l on l.receipt_id = rc.id
          where rc.tenant_id = $1
          group by rc.id, v.name
          order by rc.created_at desc`,
        [tenant_id],
      )
      return r.rows
    })
  })

  // ---- Stock + ledger (drill-down views) ----

  app.get<{ Querystring: { tenant_id?: string } }>('/v1/stock', async (req, reply) => {
    const { tenant_id } = req.query
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    return withUser(req.userId, async (db) => {
      const r = await db.query(
        `select s.*, (s.on_hand <= coalesce(s.reorder_point, 0)) as below_reorder_point
           from app.current_stock s where s.tenant_id = $1 order by s.sku`,
        [tenant_id],
      )
      return r.rows
    })
  })

  // Manual stock correction — writes an append-only ledger entry (spec §4.1 fallback path).
  app.post<{
    Body: { tenant_id: string; variant_id: string; qty_delta: number; memo?: string }
  }>('/v1/inventory-adjustments', async (req, reply) => {
    const { tenant_id, variant_id, qty_delta, memo } = req.body ?? {}
    if (!tenant_id || !variant_id || qty_delta === undefined || qty_delta === 0) {
      return reply.code(400).send({ error: 'tenant_id, variant_id and non-zero qty_delta are required' })
    }
    try {
      const entry = await withUser(req.userId, async (db) => {
        const r = await db.query(
          `insert into app.inventory_ledger_entries
             (tenant_id, variant_id, qty_delta, reason, ref_type, ref_id)
           values ($1, $2, $3, 'manual_adjustment', 'adjustment', gen_random_uuid())
           returning *`,
          [tenant_id, variant_id, qty_delta],
        )
        const created = r.rows[0]
        await db.query('select app.emit_event($1, $2, $3)', [
          tenant_id,
          'inventory.adjusted',
          JSON.stringify({
            variant_id,
            qty_delta,
            ledger_entry_id: created.id,
            memo: memo ?? null,
          }),
        ])
        return created
      })
      return reply.code(201).send(entry)
    } catch (err) {
      if (isRlsViolation(err)) return reply.code(403).send({ error: 'not a member of this tenant' })
      throw err
    }
  })

  app.get<{ Querystring: { tenant_id?: string; variant_id?: string } }>('/v1/inventory-ledger', async (req, reply) => {
    const { tenant_id, variant_id } = req.query
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    return withUser(req.userId, async (db) => {
      const r = await db.query(
        `select ile.*, v.sku from app.inventory_ledger_entries ile
           join app.variants v on v.id = ile.variant_id
          where ile.tenant_id = $1 and ($2::uuid is null or ile.variant_id = $2)
          order by ile.created_at desc limit 500`,
        [tenant_id, variant_id ?? null],
      )
      return r.rows
    })
  })
}
