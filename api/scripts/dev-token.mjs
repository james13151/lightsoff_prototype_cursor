// Mints a dev JWT for testing the API locally, standing in for a token
// issued by Supabase Auth. Usage:
//   JWT_SECRET=... node scripts/dev-token.mjs <user-uuid>
import { SignJWT } from 'jose'

const sub = process.argv[2]
if (!sub) {
  console.error('usage: node scripts/dev-token.mjs <user-uuid>')
  process.exit(1)
}
const secret = process.env.JWT_SECRET
if (!secret) {
  console.error('JWT_SECRET env var is required')
  process.exit(1)
}

const token = await new SignJWT({ role: 'authenticated' })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject(sub)
  .setIssuedAt()
  .setExpirationTime('1h')
  .sign(new TextEncoder().encode(secret))

console.log(token)
