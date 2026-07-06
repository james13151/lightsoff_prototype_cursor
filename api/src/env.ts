function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const env = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  encryptionKey: required('APP_ENCRYPTION_KEY'),
  // When true, exposes POST /dev/token for browser dev login (never enable in production).
  allowDevAuth: process.env.ALLOW_DEV_AUTH === 'true',
  // Shopify custom app credentials (optional — manual token connect still works).
  shopifyApiKey: process.env.SHOPIFY_API_KEY ?? '',
  shopifyApiSecret: process.env.SHOPIFY_API_SECRET ?? '',
  // Public API base URL for webhook registration, e.g. https://lightsoff-api.onrender.com
  apiPublicUrl: process.env.API_PUBLIC_URL ?? '',
  // Frontend URL for OAuth redirect after install, e.g. https://james13151.github.io/lightsoff_prototype_cursor
  frontendUrl: process.env.FRONTEND_URL ?? process.env.VITE_FRONTEND_URL ?? '',
}
