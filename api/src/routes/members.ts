import type { FastifyInstance } from 'fastify'
import { withUser } from '../db.js'

function mapDbError(err: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  const code = (err as { code?: string }).code
  const message = (err as Error).message ?? ''
  if (code === '42501') return reply.code(403).send({ error: 'not a member of this tenant' })
  if (message.includes('admin role required')) return reply.code(403).send({ error: 'admin role required' })
  if (message.includes('user not found')) return reply.code(404).send({ error: 'user not found' })
  if (message.includes('member not found')) return reply.code(404).send({ error: 'member not found' })
  if (message.includes('cannot')) return reply.code(400).send({ error: message })
  throw err
}

const ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: [
    'team.view', 'team.invite', 'team.manage_roles', 'team.remove',
    'settings.tenant', 'credentials.manage',
    'finance.approve_claim', 'finance.post_journal', 'finance.pay_bill',
    'inventory.write', 'inventory.adjust',
  ],
  admin: [
    'team.view', 'team.invite', 'team.manage_roles', 'team.remove',
    'credentials.manage',
    'finance.approve_claim', 'finance.post_journal', 'finance.pay_bill',
    'inventory.write', 'inventory.adjust',
  ],
  member: [
    'team.view',
    'finance.post_journal', 'finance.pay_bill',
    'inventory.write', 'inventory.adjust',
  ],
}

/** Workspace members, current user profile, and permission metadata. */
export function memberRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { tenant_id?: string } }>('/v1/me', async (req, reply) => {
    const { tenant_id } = req.query
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    return withUser(req.userId, async (db) => {
      const r = await db.query(
        `select m.user_id, m.role, m.tenant_id,
                coalesce(p.display_name, split_part(p.email, '@', 1)) as display_name,
                p.email
           from app.memberships m
           left join app.profiles p on p.id = m.user_id
          where m.tenant_id = $1 and m.user_id = auth.uid()`,
        [tenant_id],
      )
      const row = r.rows[0]
      if (!row) return reply.code(403).send({ error: 'not a member of this tenant' })
      const role = row.role as string
      return {
        user_id: row.user_id,
        tenant_id: row.tenant_id,
        role,
        display_name: row.display_name,
        email: row.email,
        permissions: ROLE_PERMISSIONS[role] ?? [],
      }
    })
  })

  app.get<{ Querystring: { tenant_id?: string } }>('/v1/members', async (req, reply) => {
    const { tenant_id } = req.query
    if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
    return withUser(req.userId, async (db) => {
      const r = await db.query(
        `select * from app.tenant_members where tenant_id = $1 order by
           case role when 'owner' then 0 when 'admin' then 1 else 2 end,
           joined_at`,
        [tenant_id],
      )
      return r.rows
    })
  })

  app.post<{
    Body: { tenant_id: string; user_id: string; role?: 'admin' | 'member'; email?: string; display_name?: string }
  }>('/v1/members', async (req, reply) => {
    const { tenant_id, user_id, role, email, display_name } = req.body ?? {}
    if (!tenant_id || !user_id) {
      return reply.code(400).send({ error: 'tenant_id and user_id are required' })
    }
    try {
      const member = await withUser(req.userId, async (db) => {
        const r = await db.query(
          `select * from app.add_tenant_member($1, $2, $3::app.member_role, $4, $5)`,
          [tenant_id, user_id, role ?? 'member', email ?? null, display_name ?? null],
        )
        return r.rows[0]
      })
      return reply.code(201).send(member)
    } catch (err) {
      return mapDbError(err, reply)
    }
  })

  app.patch<{
    Params: { userId: string }
    Body: { tenant_id: string; role: 'admin' | 'member' }
  }>('/v1/members/:userId', async (req, reply) => {
    const { tenant_id, role } = req.body ?? {}
    if (!tenant_id || !role) {
      return reply.code(400).send({ error: 'tenant_id and role are required' })
    }
    try {
      const member = await withUser(req.userId, async (db) => {
        const r = await db.query(
          `select * from app.update_member_role($1, $2, $3::app.member_role)`,
          [tenant_id, req.params.userId, role],
        )
        return r.rows[0]
      })
      return member
    } catch (err) {
      return mapDbError(err, reply)
    }
  })

  app.delete<{ Params: { userId: string }; Querystring: { tenant_id?: string } }>(
    '/v1/members/:userId',
    async (req, reply) => {
      const { tenant_id } = req.query
      if (!tenant_id) return reply.code(400).send({ error: 'tenant_id is required' })
      try {
        await withUser(req.userId, async (db) => {
          await db.query(`select app.remove_tenant_member($1, $2)`, [tenant_id, req.params.userId])
        })
        return reply.code(204).send()
      } catch (err) {
        return mapDbError(err, reply)
      }
    },
  )

  app.get('/v1/permissions', async () => ({
    roles: Object.keys(ROLE_PERMISSIONS),
    matrix: ROLE_PERMISSIONS,
  }))

  app.patch<{ Body: { email?: string; display_name?: string } }>('/v1/me/profile', async (req, reply) => {
    const { email, display_name } = req.body ?? {}
    try {
      const profile = await withUser(req.userId, async (db) => {
        const r = await db.query(
          `select * from app.upsert_profile(auth.uid(), $1, $2)`,
          [email ?? null, display_name ?? null],
        )
        return r.rows[0]
      })
      return profile
    } catch (err) {
      return mapDbError(err, reply)
    }
  })
}
