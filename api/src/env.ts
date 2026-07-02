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
}
