import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '../env.js'
import { normalizeShop } from './shopify.js'

export const SHOPIFY_OAUTH_SCOPES = [
  'read_orders',
  'write_orders',
  'read_products',
  'read_inventory',
  'write_inventory',
  'read_locations',
].join(',')

interface OAuthStatePayload {
  tenantId: string
  userId: string
  shop: string
  exp: number
  nonce: string
}

function sign(data: string): string {
  return createHmac('sha256', env.encryptionKey).update(data).digest('base64url')
}

export function createOAuthState(tenantId: string, userId: string, shop: string): string {
  const payload: OAuthStatePayload = {
    tenantId,
    userId,
    shop: normalizeShop(shop),
    exp: Date.now() + 10 * 60 * 1000,
    nonce: randomBytes(16).toString('hex'),
  }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${data}.${sign(data)}`
}

export function parseOAuthState(state: string): OAuthStatePayload {
  const [data, sig] = state.split('.')
  if (!data || !sig) throw new Error('invalid oauth state')
  const expected = sign(data)
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      throw new Error('invalid oauth state signature')
    }
  } catch {
    throw new Error('invalid oauth state signature')
  }
  const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as OAuthStatePayload
  if (!payload.tenantId || !payload.userId || !payload.shop) throw new Error('invalid oauth state payload')
  if (payload.exp < Date.now()) throw new Error('oauth state expired')
  return payload
}

export function shopifyOAuthRedirectUri(): string {
  if (!env.apiPublicUrl) throw new Error('API_PUBLIC_URL is not configured')
  return `${env.apiPublicUrl.replace(/\/$/, '')}/v1/shopify/oauth/callback`
}

export function buildShopifyInstallUrl(shop: string, state: string): string {
  if (!env.shopifyApiKey) throw new Error('SHOPIFY_API_KEY is not configured')
  const normalized = normalizeShop(shop)
  const params = new URLSearchParams({
    client_id: env.shopifyApiKey,
    scope: SHOPIFY_OAUTH_SCOPES,
    redirect_uri: shopifyOAuthRedirectUri(),
    state,
  })
  return `https://${normalized}/admin/oauth/authorize?${params}`
}

export async function exchangeShopifyOAuthCode(shop: string, code: string): Promise<{
  access_token: string
  scope: string
}> {
  if (!env.shopifyApiKey || !env.shopifyApiSecret) {
    throw new Error('SHOPIFY_API_KEY and SHOPIFY_API_SECRET must be configured')
  }
  const normalized = normalizeShop(shop)
  const res = await fetch(`https://${normalized}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.shopifyApiKey,
      client_secret: env.shopifyApiSecret,
      code,
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Shopify token exchange failed: ${text || res.statusText}`)
  return JSON.parse(text) as { access_token: string; scope: string }
}

export function shopifyOAuthSuccessRedirect(shop: string): string {
  const base = (env.frontendUrl || '').replace(/\/$/, '')
  const params = new URLSearchParams({ shopify: 'connected', shop })
  if (base) return `${base}/?${params}`
  return `/?${params}`
}

export function shopifyOAuthErrorRedirect(message: string): string {
  const base = (env.frontendUrl || '').replace(/\/$/, '')
  const params = new URLSearchParams({ shopify: 'error', message })
  if (base) return `${base}/?${params}`
  return `/?${params}`
}
