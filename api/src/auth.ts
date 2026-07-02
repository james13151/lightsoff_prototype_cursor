import { jwtVerify } from 'jose'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { env } from './env.js'

const secret = new TextEncoder().encode(env.jwtSecret)

declare module 'fastify' {
  interface FastifyRequest {
    userId: string
  }
}

/** Fastify preHandler: verifies the HS256 bearer token and attaches userId. */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'missing bearer token' })
  }
  try {
    const { payload } = await jwtVerify(header.slice(7), secret)
    if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('no sub claim')
    request.userId = payload.sub
  } catch {
    return reply.code(401).send({ error: 'invalid token' })
  }
}
