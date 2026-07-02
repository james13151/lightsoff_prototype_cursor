function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const env = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: required('DATABASE_URL'),
  // On Supabase this is the project's JWT secret (Settings -> API), so tokens
  // issued by Supabase Auth verify here without any extra auth service.
  jwtSecret: required('JWT_SECRET'),
  // Key for the integration credential vault. Only this process ever holds it;
  // the database can't decrypt credentials without it.
  encryptionKey: required('APP_ENCRYPTION_KEY'),
}
