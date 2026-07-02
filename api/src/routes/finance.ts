import type { FastifyInstance } from 'fastify'
import { withUser } from '../db.js'

function isRlsViolation(err: unknown): boolean {
  return (err as { code?: string }).code === '42501'
}

function friendlyDbError(err: unknown): string | null {
  const message = (err as Error).message ?? ''
  if (message.includes('does not balance')) return message
  if (message.includes('unknown account code')) return message
  if (message.includes('allocation exceeds') || message.includes('allocations exceed')) return message
  if (message.includes('admin role required')) return message
  if (message.includes('not pending review')) return message
  return null
}

/** Finance / Bookkeeping routes (spec §4.2). Registered under an authed scope. */
export function financeRoutes(app: FastifyInstance) {
  // ---- Chart of accounts + balances ----

  app.get<{ Querystring: { tenant_id?: string } }>('/v1/accounts', async (req, reply) => {
    const { tenant_id } = req.query
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    return withUser(req.userId, async (db) => {
      const r = await db.query(
        `select b.account_id as id, b.code, b.name, b.type, b.net_debit
           from app.account_balances b where b.tenant_id = $1 order by b.code`,
        [tenant_id],
      )
      return r.rows
    })
  })

  // Cash position + P&L computed straight from the journal (spec §4.2).
  app.get<{ Querystring: { tenant_id?: string } }>('/v1/finance/summary', async (req, reply) => {
    const { tenant_id } = req.query
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    return withUser(req.userId, async (db) => {
      const r = await db.query(
        `select
           sum(net_debit) filter (where code = '1000')            as cash,
           sum(net_debit) filter (where code = '1100')            as petty_cash,
           -sum(net_debit) filter (where code = '2000')           as accounts_payable,
           -sum(net_debit) filter (where type = 'revenue')        as revenue,
           sum(net_debit) filter (where type = 'expense')         as expenses,
           -sum(net_debit) filter (where type = 'revenue')
             - sum(net_debit) filter (where type = 'expense')     as net_profit
         from app.account_balances where tenant_id = $1`,
        [tenant_id],
      )
      return r.rows[0]
    })
  })

  // ---- Journal ----

  app.get<{ Querystring: { tenant_id?: string } }>('/v1/journal', async (req, reply) => {
    const { tenant_id } = req.query
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    return withUser(req.userId, async (db) => {
      const r = await db.query(
        `select je.*,
                jsonb_agg(jsonb_build_object(
                  'account_code', a.code, 'account_name', a.name,
                  'debit', jl.debit, 'credit', jl.credit
                ) order by jl.debit desc) as lines
           from app.journal_entries je
           join app.journal_lines jl on jl.entry_id = je.id
           join app.accounts a on a.id = jl.account_id
          where je.tenant_id = $1
          group by je.id
          order by je.posted_at desc limit 200`,
        [tenant_id],
      )
      return r.rows
    })
  })

  app.post<{
    Body: { tenant_id: string; memo: string; lines: { account_code: string; debit?: number; credit?: number }[] }
  }>('/v1/journal', async (req, reply) => {
    const { tenant_id, memo, lines } = req.body ?? {}
    if (!tenant_id || !memo || !Array.isArray(lines)) {
      return reply.code(400).send({ error: 'tenant_id, memo and lines are required' })
    }
    try {
      const id = await withUser(req.userId, async (db) => {
        const r = await db.query(`select app.post_journal_entry($1, $2, 'manual', $3) as id`, [
          tenant_id,
          memo,
          JSON.stringify(lines),
        ])
        return r.rows[0].id
      })
      return reply.code(201).send({ id })
    } catch (err) {
      const friendly = friendlyDbError(err)
      if (friendly) return reply.code(400).send({ error: friendly })
      if (isRlsViolation(err)) return reply.code(403).send({ error: 'not a member of this tenant' })
      throw err
    }
  })

  // ---- Vendor bills + payments ----

  app.get<{ Querystring: { tenant_id?: string; status?: string } }>('/v1/bills', async (req, reply) => {
    const { tenant_id, status } = req.query
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    return withUser(req.userId, async (db) => {
      const r = await db.query(
        `select b.*, v.name as vendor_name,
                coalesce((select sum(a.amount) from app.vendor_payment_allocations a where a.bill_id = b.id), 0) as amount_paid
           from app.vendor_bills b join app.vendors v on v.id = b.vendor_id
          where b.tenant_id = $1 and ($2::app.bill_status is null or b.status = $2)
          order by b.due_date nulls last`,
        [tenant_id, status ?? null],
      )
      return r.rows
    })
  })

  app.post<{
    Body: {
      tenant_id: string; vendor_id: string; amount: number; bill_number?: string
      po_id?: string; due_date?: string; memo?: string; expense_account_code?: string
    }
  }>('/v1/bills', async (req, reply) => {
    const { tenant_id, vendor_id, amount, bill_number, po_id, due_date, memo, expense_account_code } = req.body ?? {}
    if (!tenant_id || !vendor_id || !amount) {
      return reply.code(400).send({ error: 'tenant_id, vendor_id and amount are required' })
    }
    try {
      const bill = await withUser(req.userId, async (db) => {
        const r = await db.query(
          `insert into app.vendor_bills
             (tenant_id, vendor_id, amount, bill_number, po_id, due_date, memo, expense_account_id, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, app.account_id_by_code($1, coalesce($8, '1200')), $9)
           returning *`,
          [tenant_id, vendor_id, amount, bill_number ?? null, po_id ?? null, due_date ?? null, memo ?? null, expense_account_code ?? null, req.userId],
        )
        return r.rows[0]
      })
      return reply.code(201).send(bill)
    } catch (err) {
      if (isRlsViolation(err)) return reply.code(403).send({ error: 'not a member of this tenant' })
      throw err
    }
  })

  // One call records the payment and allocates it; the DB posts AP<-Cash and
  // rolls bill status (partially_paid/paid) + emits bill.paid.
  app.post<{
    Body: { tenant_id: string; vendor_id: string; amount: number; method?: string; memo?: string; allocations: { bill_id: string; amount: number }[] }
  }>('/v1/payments', async (req, reply) => {
    const { tenant_id, vendor_id, amount, method, memo, allocations } = req.body ?? {}
    if (!tenant_id || !vendor_id || !amount || !Array.isArray(allocations) || allocations.length === 0) {
      return reply.code(400).send({ error: 'tenant_id, vendor_id, amount and allocations are required' })
    }
    try {
      const payment = await withUser(req.userId, async (db) => {
        const r = await db.query(
          `insert into app.vendor_payments (tenant_id, vendor_id, amount, method, memo, created_by)
           values ($1, $2, $3, coalesce($4, 'bank_transfer'), $5, $6) returning *`,
          [tenant_id, vendor_id, amount, method ?? null, memo ?? null, req.userId],
        )
        const created = r.rows[0]
        for (const alloc of allocations) {
          await db.query(
            `insert into app.vendor_payment_allocations (tenant_id, payment_id, bill_id, amount)
             values ($1, $2, $3, $4)`,
            [tenant_id, created.id, alloc.bill_id, alloc.amount],
          )
        }
        return created
      })
      return reply.code(201).send(payment)
    } catch (err) {
      const friendly = friendlyDbError(err)
      if (friendly) return reply.code(400).send({ error: friendly })
      if (isRlsViolation(err)) return reply.code(403).send({ error: 'not a member of this tenant' })
      throw err
    }
  })

  // ---- Expense claims (petty cash) ----

  app.get<{ Querystring: { tenant_id?: string; status?: string } }>('/v1/expense-claims', async (req, reply) => {
    const { tenant_id, status } = req.query
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    return withUser(req.userId, async (db) => {
      const r = await db.query(
        `select ec.*, a.code as category_code, a.name as category_name
           from app.expense_claims ec join app.accounts a on a.id = ec.category_account_id
          where ec.tenant_id = $1 and ($2::app.claim_status is null or ec.status = $2)
          order by ec.created_at desc`,
        [tenant_id, status ?? null],
      )
      return r.rows
    })
  })

  app.post<{
    Body: { tenant_id: string; vendor_name: string; amount: number; category_account_code: string; confidence?: number; source?: string; notes?: string }
  }>('/v1/expense-claims', async (req, reply) => {
    const { tenant_id, vendor_name, amount, category_account_code, confidence, source, notes } = req.body ?? {}
    if (!tenant_id || !vendor_name || !amount || !category_account_code) {
      return reply.code(400).send({ error: 'tenant_id, vendor_name, amount and category_account_code are required' })
    }
    try {
      const claim = await withUser(req.userId, async (db) => {
        const r = await db.query(
          `insert into app.expense_claims
             (tenant_id, claimant_id, vendor_name, amount, category_account_id, confidence, source, notes)
           values ($1, $2, $3, $4, app.account_id_by_code($1, $5), $6, coalesce($7, 'manual'), $8)
           returning *`,
          [tenant_id, req.userId, vendor_name, amount, category_account_code, confidence ?? null, source ?? null, notes ?? null],
        )
        return r.rows[0]
      })
      return reply.code(201).send(claim)
    } catch (err) {
      if (isRlsViolation(err)) return reply.code(403).send({ error: 'not a member of this tenant' })
      throw err
    }
  })

  app.post<{ Params: { id: string } }>('/v1/expense-claims/:id/approve', async (req, reply) => {
    try {
      await withUser(req.userId, (db) => db.query('select app.approve_expense_claim($1)', [req.params.id]))
      return { ok: true }
    } catch (err) {
      const friendly = friendlyDbError(err)
      if (friendly) return reply.code(403).send({ error: friendly })
      if ((err as Error).message?.includes('not found')) return reply.code(404).send({ error: 'claim not found' })
      throw err
    }
  })

  app.post<{ Params: { id: string } }>('/v1/expense-claims/:id/reject', async (req, reply) => {
    try {
      await withUser(req.userId, (db) => db.query('select app.reject_expense_claim($1)', [req.params.id]))
      return { ok: true }
    } catch (err) {
      const friendly = friendlyDbError(err)
      if (friendly) return reply.code(403).send({ error: friendly })
      if ((err as Error).message?.includes('not found')) return reply.code(404).send({ error: 'claim not found' })
      throw err
    }
  })
}
