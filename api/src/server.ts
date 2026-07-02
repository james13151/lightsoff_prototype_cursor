import Fastify from 'fastify'
import cors from '@fastify/cors'
import { requireAuth } from './auth.js'
import { withUser } from './db.js'
import { inventoryRoutes } from './routes/inventory.js'
import { financeRoutes } from './routes/finance.js'
import { registerDevAuth } from './devAuth.js'
import { env } from './env.js'

export function buildServer() {
  const app = Fastify({ logger: true })

  app.register(cors, {
    origin: true, // reflect request origin — fine for prototype; tighten for production
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  })

  app.get('/health', async () => ({ ok: true, service: 'lightsoff-api', devAuth: env.allowDevAuth }))

  registerDevAuth(app)

  app.register(async (authed) => {
    authed.addHook('preHandler', requireAuth)

    inventoryRoutes(authed)
    financeRoutes(authed)

    // ---- Tenants ----

    authed.post<{ Body: { name: string } }>('/v1/tenants', async (req, reply) => {
      const { name } = req.body ?? {}
      if (!name?.trim()) return reply.code(400).send({ error: 'name is required' })
      const tenant = await withUser(req.userId, async (db) => {
        const r = await db.query('select * from app.create_tenant($1)', [name.trim()])
        return r.rows[0]
      })
      return reply.code(201).send(tenant)
    })

    authed.get('/v1/tenants', async (req) => {
      return withUser(req.userId, async (db) => {
        const r = await db.query(
          `select t.*, m.role
             from app.tenants t
             join app.memberships m on m.tenant_id = t.id and m.user_id = auth.uid()
            order by t.created_at`,
        )
        return r.rows
      })
    })

    // ---- Vendors (exemplar shared entity; module CRUD follows this shape) ----
    // Note there is no `where tenant_id = ...` beyond the parameter itself:
    // if the caller is not a member of that tenant, RLS returns zero rows /
    // rejects the write. The app layer never re-implements the boundary.

    authed.get<{ Querystring: { tenant_id?: string } }>('/v1/vendors', async (req, reply) => {
      const { tenant_id } = req.query
      if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
      return withUser(req.userId, async (db) => {
        const r = await db.query('select * from app.vendors where tenant_id = $1 order by name', [tenant_id])
        return r.rows
      })
    })

    authed.post<{ Body: { tenant_id: string; name: string; lead_time_days?: number; contact_email?: string } }>(
      '/v1/vendors',
      async (req, reply) => {
        const { tenant_id, name, lead_time_days, contact_email } = req.body ?? {}
        if (!tenant_id || !name?.trim()) {
          return reply.code(400).send({ error: 'tenant_id and name are required' })
        }
        try {
          const vendor = await withUser(req.userId, async (db) => {
            const r = await db.query(
              `insert into app.vendors (tenant_id, name, lead_time_days, contact_email)
               values ($1, $2, $3, $4) returning *`,
              [tenant_id, name.trim(), lead_time_days ?? null, contact_email ?? null],
            )
            return r.rows[0]
          })
          return reply.code(201).send(vendor)
        } catch (err: unknown) {
          // RLS with-check violations surface as 42501
          if ((err as { code?: string }).code === '42501') {
            return reply.code(403).send({ error: 'not a member of this tenant' })
          }
          throw err
        }
      },
    )

    // ---- Event bus ----

    authed.get<{ Querystring: { tenant_id?: string; after_seq?: string; type?: string } }>(
      '/v1/events',
      async (req, reply) => {
        const { tenant_id, after_seq, type } = req.query
        if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
        return withUser(req.userId, async (db) => {
          const r = await db.query(
            `select seq, id, tenant_id, type, version, payload, emitted_by, created_at
               from app.events
              where tenant_id = $1
                and seq > coalesce($2::bigint, 0)
                and ($3::text is null or type = $3)
              order by seq
              limit 200`,
            [tenant_id, after_seq ?? null, type ?? null],
          )
          return r.rows
        })
      },
    )

    authed.post<{ Body: { tenant_id: string; type: string; payload?: Record<string, unknown> } }>(
      '/v1/events',
      async (req, reply) => {
        const { tenant_id, type, payload } = req.body ?? {}
        if (!tenant_id || !type) return reply.code(400).send({ error: 'tenant_id and type are required' })
        try {
          const id = await withUser(req.userId, async (db) => {
            const r = await db.query('select app.emit_event($1, $2, $3) as id', [
              tenant_id,
              type,
              JSON.stringify(payload ?? {}),
            ])
            return r.rows[0].id
          })
          return reply.code(201).send({ id })
        } catch (err: unknown) {
          const message = (err as Error).message ?? ''
          if (message.includes('not a member')) {
            return reply.code(403).send({ error: 'not a member of this tenant' })
          }
          if (message.includes('events_type_check')) {
            return reply.code(400).send({ error: 'event type must match module.event (e.g. inventory.received)' })
          }
          throw err
        }
      },
    )

    // ---- Integration credential vault ----
    // Metadata only on GET; plaintext is never returned by the API. Workers
    // that need a token call reveal_credential in their own db session.

    authed.get<{ Querystring: { tenant_id?: string } }>('/v1/credentials', async (req, reply) => {
      const { tenant_id } = req.query
      if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
      return withUser(req.userId, async (db) => {
        const r = await db.query(
          `select id, tenant_id, provider, label, created_at, updated_at
             from app.integration_credentials
            where tenant_id = $1
            order by provider, label`,
          [tenant_id],
        )
        return r.rows
      })
    })

    authed.post<{
      Body: { tenant_id: string; provider: string; label: string; secret: Record<string, unknown> }
    }>('/v1/credentials', async (req, reply) => {
      const { tenant_id, provider, label, secret } = req.body ?? {}
      if (!tenant_id || !provider || !label || !secret) {
        return reply.code(400).send({ error: 'tenant_id, provider, label, secret are required' })
      }
      try {
        const id = await withUser(req.userId, async (db) => {
          const r = await db.query('select app.store_credential($1, $2, $3, $4) as id', [
            tenant_id,
            provider,
            label,
            JSON.stringify(secret),
          ])
          return r.rows[0].id
        })
        return reply.code(201).send({ id })
      } catch (err: unknown) {
        const message = (err as Error).message ?? ''
        if (message.includes('admin role required')) {
          return reply.code(403).send({ error: 'admin role required' })
        }
        if (message.includes('invalid input value for enum')) {
          return reply.code(400).send({ error: 'unknown provider' })
        }
        throw err
      }
    })
  })

  return app
}
