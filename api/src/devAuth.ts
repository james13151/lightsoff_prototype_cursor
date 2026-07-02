import { SignJWT } from 'jose'
import type { FastifyInstance } from 'fastify'
import { env } from './env.js'

const secret = () => new TextEncoder().encode(env.jwtSecret)

/** Dev-only token minting so the browser prototype can authenticate without Supabase Auth yet. */
export function registerDevAuth(app: FastifyInstance) {
  if (!env.allowDevAuth) return

  app.post<{ Body: { user_id?: string } }>('/dev/token', async (req, reply) => {
    const userId = req.body?.user_id?.trim()
    if (!userId) return reply.code(400).send({ error: 'user_id is required' })
    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret())
    return { token, user_id: userId }
  })
}
