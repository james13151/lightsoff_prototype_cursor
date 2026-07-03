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
      tenant_id: string
      title: string
      description?: string
      brand?: string
      product_type?: string
      default_vendor_id?: string
      custom_attributes?: Record<string, unknown>
      shopify_product_id?: number
      options?: { name: string; values: string[]; position?: number }[]
      variants: {
        sku: string
        title?: string
        price?: number
        unit_cost?: number
        reorder_point?: number
        barcode?: string
        weight?: number
        weight_unit?: string
        shopify_variant_id?: number
        option_values?: Record<string, string>
      }[]
    }
  }>('/v1/products', async (req, reply) => {
    const {
      tenant_id, title, description, brand, product_type, default_vendor_id,
      custom_attributes, shopify_product_id, options, variants,
    } = req.body ?? {}
    if (!tenant_id || !title || !Array.isArray(variants) || variants.length === 0) {
      return reply.code(400).send({ error: 'tenant_id, title and at least one variant are required' })
    }
    try {
      const productId = await withUser(req.userId, async (db) => {
        if (options?.length) {
          const r = await db.query(
            `select app.create_product_with_variants($1, $2, $3, $4, $5, $6, $7, $8, $9) as id`,
            [
              tenant_id, title, description ?? null, brand ?? null, product_type ?? null,
              default_vendor_id ?? null, JSON.stringify(custom_attributes ?? {}),
              JSON.stringify(options.map((o) => ({ name: o.name, values: o.values, position: o.position }))),
              JSON.stringify(variants),
            ],
          )
          return r.rows[0].id as string
        }
        const r = await db.query(
          `insert into app.products (tenant_id, title, description, brand, product_type, default_vendor_id, custom_attributes, shopify_product_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
          [tenant_id, title, description ?? null, brand ?? null, product_type ?? null, default_vendor_id ?? null, JSON.stringify(custom_attributes ?? {}), shopify_product_id ?? null],
        )
        const created = r.rows[0]
        for (const v of variants) {
          await db.query(
            `insert into app.variants (tenant_id, product_id, sku, title, price, unit_cost, reorder_point, barcode, weight, weight_unit, shopify_variant_id)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [tenant_id, created.id, v.sku, v.title ?? null, v.price ?? null, v.unit_cost ?? null, v.reorder_point ?? null, v.barcode ?? null, v.weight ?? null, v.weight_unit ?? null, v.shopify_variant_id ?? null],
          )
        }
        return created.id as string
      })
      const product = await withUser(req.userId, async (db) => {
        const r = await db.query(`select * from app.products where id = $1`, [productId])
        return r.rows[0]
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
        `select p.*,
                coalesce((
                  select jsonb_agg(jsonb_build_object('id', po.id, 'name', po.name, 'position', po.position,
                    'values', (
                      select coalesce(jsonb_agg(jsonb_build_object('id', pov.id, 'value', pov.value, 'position', pov.position) order by pov.position), '[]')
                        from app.product_option_values pov where pov.option_id = po.id
                    )) order by po.position)
                  from app.product_options po where po.product_id = p.id
                ), '[]') as options,
                coalesce(jsonb_agg(jsonb_build_object(
                  'id', v.id, 'sku', v.sku, 'title', v.title,
                  'price', v.price, 'unit_cost', v.unit_cost, 'reorder_point', v.reorder_point,
                  'barcode', v.barcode, 'weight', v.weight, 'weight_unit', v.weight_unit,
                  'option_values', (
                    select coalesce(jsonb_object_agg(po.name, pov.value), '{}'::jsonb)
                      from app.variant_option_selections vos
                      join app.product_options po on po.id = vos.option_id
                      join app.product_option_values pov on pov.id = vos.option_value_id
                     where vos.variant_id = v.id
                  )
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

  app.patch<{
    Params: { id: string }
    Body: { title?: string; description?: string; brand?: string; product_type?: string; default_vendor_id?: string; custom_attributes?: Record<string, unknown> }
  }>('/v1/products/:id', async (req, reply) => {
    const { title, description, brand, product_type, default_vendor_id, custom_attributes } = req.body ?? {}
    try {
      const product = await withUser(req.userId, async (db) => {
        const r = await db.query(
          `update app.products set
             title = coalesce($2, title),
             description = coalesce($3, description),
             brand = coalesce($4, brand),
             product_type = coalesce($5, product_type),
             default_vendor_id = coalesce($6, default_vendor_id),
             custom_attributes = coalesce($7, custom_attributes),
             updated_at = now()
           where id = $1 returning *`,
          [req.params.id, title ?? null, description ?? null, brand ?? null, product_type ?? null, default_vendor_id ?? null, custom_attributes ? JSON.stringify(custom_attributes) : null],
        )
        return r.rows[0]
      })
      if (!product) return reply.code(404).send({ error: 'product not found' })
      return product
    } catch (err) {
      if (isRlsViolation(err)) return reply.code(403).send({ error: 'not a member of this tenant' })
      throw err
    }
  })

  app.patch<{
    Params: { id: string }
    Body: { sku?: string; title?: string; price?: number; unit_cost?: number; reorder_point?: number; barcode?: string }
  }>('/v1/variants/:id', async (req, reply) => {
    const { sku, title, price, unit_cost, reorder_point, barcode } = req.body ?? {}
    try {
      const variant = await withUser(req.userId, async (db) => {
        const r = await db.query(
          `update app.variants set
             sku = coalesce($2, sku),
             title = coalesce($3, title),
             price = coalesce($4, price),
             unit_cost = coalesce($5, unit_cost),
             reorder_point = coalesce($6, reorder_point),
             barcode = coalesce($7, barcode),
             updated_at = now()
           where id = $1 returning *`,
          [req.params.id, sku ?? null, title ?? null, price ?? null, unit_cost ?? null, reorder_point ?? null, barcode ?? null],
        )
        return r.rows[0]
      })
      if (!variant) return reply.code(404).send({ error: 'variant not found' })
      return variant
    } catch (err) {
      if (isRlsViolation(err)) return reply.code(403).send({ error: 'not a member of this tenant' })
      throw err
    }
  })

  // ---- Purchase orders ----

  app.post<{
    Body: { tenant_id: string; vendor_id: string; lines: POLineInput[]; notes?: string; source?: string; po_number?: string; expected_at?: string }
  }>('/v1/purchase-orders', async (req, reply) => {
    const { tenant_id, vendor_id, lines, notes, source, po_number, expected_at } = req.body ?? {}
    if (!tenant_id || !vendor_id || !Array.isArray(lines) || lines.length === 0) {
      return reply.code(400).send({ error: 'tenant_id, vendor_id and at least one line are required' })
    }
    try {
      const po = await withUser(req.userId, async (db) => {
        const r = await db.query(
          `insert into app.purchase_orders (tenant_id, vendor_id, notes, source, po_number, expected_at, created_by)
           values ($1, $2, $3, coalesce($4, 'manual'), $5, $6, $7) returning *`,
          [tenant_id, vendor_id, notes ?? null, source ?? null, po_number ?? null, expected_at ?? null, req.userId],
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
                  'qty', l.qty, 'unit_cost', l.unit_cost,
                  'received_qty', coalesce((
                    select sum(rli.qty) from app.receipt_line_items rli
                    join app.receipts rr on rr.id = rli.receipt_id
                    where rli.po_line_item_id = l.id and rr.finalized_at is not null
                  ), 0),
                  'line_total', l.qty * l.unit_cost
                ) order by l.id) filter (where l.id is not null), '[]') as lines,
                coalesce((
                  select jsonb_agg(jsonb_build_object('id', b.id, 'bill_number', b.bill_number, 'amount', b.amount, 'status', b.status))
                    from app.vendor_bills b where b.po_id = po.id
                ), '[]') as bills
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

  // ---- Warehouses / locations ----

  app.get<{ Querystring: { tenant_id?: string } }>('/v1/warehouses', async (req, reply) => {
    const { tenant_id } = req.query
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    return withUser(req.userId, async (db) => {
      const r = await db.query(
        `select * from app.warehouses where tenant_id = $1 order by is_default desc, code`,
        [tenant_id],
      )
      return r.rows
    })
  })

  app.post<{
    Body: {
      tenant_id: string
      code: string
      name: string
      is_default?: boolean
      contact_name?: string
      contact_email?: string
      contact_phone?: string
      address?: Record<string, unknown>
    }
  }>('/v1/warehouses', async (req, reply) => {
    const { tenant_id, code, name, is_default, contact_name, contact_email, contact_phone, address } = req.body ?? {}
    if (!tenant_id || !code?.trim() || !name?.trim()) {
      return reply.code(400).send({ error: 'tenant_id, code and name are required' })
    }
    try {
      const warehouse = await withUser(req.userId, async (db) => {
        if (is_default) {
          await db.query(
            `update app.warehouses set is_default = false where tenant_id = $1`,
            [tenant_id],
          )
        }
        const r = await db.query(
          `insert into app.warehouses (tenant_id, code, name, is_default, contact_name, contact_email, contact_phone, address)
           values ($1, $2, $3, coalesce($4, false), $5, $6, $7, coalesce($8, '{}'::jsonb)) returning *`,
          [tenant_id, code.trim().toUpperCase(), name.trim(), is_default ?? false, contact_name ?? null, contact_email ?? null, contact_phone ?? null, JSON.stringify(address ?? {})],
        )
        return r.rows[0]
      })
      return reply.code(201).send(warehouse)
    } catch (err) {
      if (isRlsViolation(err)) return reply.code(403).send({ error: 'not a member of this tenant' })
      throw err
    }
  })

  app.patch<{
    Params: { id: string }
    Body: {
      name?: string
      is_default?: boolean
      contact_name?: string
      contact_email?: string
      contact_phone?: string
      address?: Record<string, unknown>
    }
  }>('/v1/warehouses/:id', async (req, reply) => {
    const { name, is_default, contact_name, contact_email, contact_phone, address } = req.body ?? {}
    try {
      const warehouse = await withUser(req.userId, async (db) => {
        if (is_default) {
          const wh = await db.query(`select tenant_id from app.warehouses where id = $1`, [req.params.id])
          if (wh.rows[0]) {
            await db.query(`update app.warehouses set is_default = false where tenant_id = $1`, [wh.rows[0].tenant_id])
          }
        }
        const r = await db.query(
          `update app.warehouses set
             name = coalesce($2, name),
             is_default = coalesce($3, is_default),
             contact_name = coalesce($4, contact_name),
             contact_email = coalesce($5, contact_email),
             contact_phone = coalesce($6, contact_phone),
             address = coalesce($7, address)
           where id = $1 returning *`,
          [req.params.id, name ?? null, is_default ?? null, contact_name ?? null, contact_email ?? null, contact_phone ?? null, address ? JSON.stringify(address) : null],
        )
        return r.rows[0]
      })
      if (!warehouse) return reply.code(404).send({ error: 'warehouse not found' })
      return warehouse
    } catch (err) {
      if (isRlsViolation(err)) return reply.code(403).send({ error: 'not a member of this tenant' })
      throw err
    }
  })

  // ---- Receipts ----
  // Creates the receipt + lines and finalizes atomically: ledger entries are
  // written, PO status rolls forward, discrepancies are flagged on the bus.

  app.post<{
    Body: { tenant_id: string; vendor_id: string; po_id?: string; warehouse_id?: string; type?: 'commercial' | 'sample'; lines: ReceiptLineInput[]; notes?: string }
  }>('/v1/receipts', async (req, reply) => {
    const { tenant_id, vendor_id, po_id, warehouse_id, type, lines, notes } = req.body ?? {}
    if (!tenant_id || !vendor_id || !Array.isArray(lines) || lines.length === 0) {
      return reply.code(400).send({ error: 'tenant_id, vendor_id and at least one line are required' })
    }
    try {
      const result = await withUser(req.userId, async (db) => {
        const r = await db.query(
          `insert into app.receipts (tenant_id, po_id, vendor_id, warehouse_id, type, notes, created_by)
           values ($1, $2, $3, $4, coalesce($5, 'commercial')::app.receipt_type, $6, $7) returning *`,
          [tenant_id, po_id ?? null, vendor_id, warehouse_id ?? null, type ?? null, notes ?? null, req.userId],
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
        `select rc.*, v.name as vendor_name, w.code as warehouse_code, w.name as warehouse_name,
                coalesce(jsonb_agg(jsonb_build_object(
                  'id', l.id, 'variant_id', l.variant_id, 'description', l.description, 'qty', l.qty,
                  'po_line_item_id', l.po_line_item_id
                )) filter (where l.id is not null), '[]') as lines,
                coalesce((
                  select jsonb_agg(jsonb_build_object('id', b.id, 'bill_number', b.bill_number, 'amount', b.amount, 'status', b.status))
                    from app.vendor_bills b where b.receipt_id = rc.id
                ), '[]') as bills
           from app.receipts rc
           join app.vendors v on v.id = rc.vendor_id
           left join app.warehouses w on w.id = rc.warehouse_id
           left join app.receipt_line_items l on l.receipt_id = rc.id
          where rc.tenant_id = $1
          group by rc.id, v.name, w.code, w.name
          order by rc.created_at desc`,
        [tenant_id],
      )
      return r.rows
    })
  })

  // ---- Stock + ledger (drill-down views) ----

  app.get<{ Querystring: { tenant_id?: string; warehouse_id?: string } }>('/v1/stock', async (req, reply) => {
    const { tenant_id, warehouse_id } = req.query
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    return withUser(req.userId, async (db) => {
      if (warehouse_id) {
        const r = await db.query(
          `select s.*, (s.on_hand <= coalesce(s.reorder_point, 0)) as below_reorder_point
             from app.stock_by_warehouse s
            where s.tenant_id = $1 and s.warehouse_id = $2
            order by s.sku`,
          [tenant_id, warehouse_id],
        )
        return r.rows
      }
      const r = await db.query(
        `select s.*, (s.on_hand <= coalesce(s.reorder_point, 0)) as below_reorder_point
           from app.current_stock s where s.tenant_id = $1 order by s.sku`,
        [tenant_id],
      )
      return r.rows
    })
  })

  app.get<{ Querystring: { tenant_id?: string; warehouse_id?: string } }>('/v1/stock-by-warehouse', async (req, reply) => {
    const { tenant_id, warehouse_id } = req.query
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    return withUser(req.userId, async (db) => {
      const r = await db.query(
        `select * from app.stock_by_warehouse
          where tenant_id = $1 and ($2::uuid is null or warehouse_id = $2)
          order by warehouse_code, sku`,
        [tenant_id, warehouse_id ?? null],
      )
      return r.rows
    })
  })

  // Manual stock correction — writes an append-only ledger entry (spec §4.1 fallback path).
  app.post<{
    Body: { tenant_id: string; variant_id: string; qty_delta: number; warehouse_id?: string; memo?: string }
  }>('/v1/inventory-adjustments', async (req, reply) => {
    const { tenant_id, variant_id, qty_delta, warehouse_id, memo } = req.body ?? {}
    if (!tenant_id || !variant_id || qty_delta === undefined || qty_delta === 0) {
      return reply.code(400).send({ error: 'tenant_id, variant_id and non-zero qty_delta are required' })
    }
    try {
      const entry = await withUser(req.userId, async (db) => {
        const wh = await db.query(
          `select coalesce(
             (select id from app.warehouses where id = $3 and tenant_id = $1),
             app.default_warehouse_id($1)
           ) as id,
           (select code from app.warehouses where id = coalesce($3, app.default_warehouse_id($1))) as code`,
          [tenant_id, variant_id, warehouse_id ?? null],
        )
        const whId = wh.rows[0]?.id as string | null
        const whCode = wh.rows[0]?.code as string | null
        if (!whId) throw Object.assign(new Error('no warehouse for tenant'), { code: 'WH01' })
        const r = await db.query(
          `insert into app.inventory_ledger_entries
             (tenant_id, variant_id, qty_delta, reason, ref_type, ref_id, warehouse_id, location)
           values ($1, $2, $3, 'manual_adjustment', 'adjustment', gen_random_uuid(), $4, $5)
           returning *`,
          [tenant_id, variant_id, qty_delta, whId, whCode],
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

  app.get<{ Querystring: { tenant_id?: string; variant_id?: string; warehouse_id?: string } }>('/v1/inventory-ledger', async (req, reply) => {
    const { tenant_id, variant_id, warehouse_id } = req.query
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    return withUser(req.userId, async (db) => {
      const r = await db.query(
        `select ile.*, v.sku, w.code as warehouse_code, w.name as warehouse_name
           from app.inventory_ledger_entries ile
           join app.variants v on v.id = ile.variant_id
           left join app.warehouses w on w.id = ile.warehouse_id
          where ile.tenant_id = $1
            and ($2::uuid is null or ile.variant_id = $2)
            and ($3::uuid is null or ile.warehouse_id = $3)
          order by ile.created_at desc limit 500`,
        [tenant_id, variant_id ?? null, warehouse_id ?? null],
      )
      return r.rows
    })
  })
}
