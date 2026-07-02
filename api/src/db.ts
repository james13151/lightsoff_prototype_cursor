import pg from 'pg'
import { env } from './env.js'

// The pool must connect as a role WITHOUT bypassrls/table-ownership
// (e.g. a dedicated `lightsoff_api` login created IN ROLE authenticated).
// RLS is the tenant boundary; the API never filters by tenant in app code.
export const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 10 })

export interface DbSession {
  query: <R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ) => Promise<pg.QueryResult<R>>
}

/**
 * Runs `fn` inside a transaction with the caller's identity applied the same
 * way Supabase/PostgREST do: `request.jwt.claims` carries the user id, and
 * every RLS policy keys off auth.uid() reading that setting. The encryption
 * key for the credential vault is also scoped to the transaction
 * (set_config(..., true) = transaction-local, wiped at COMMIT/ROLLBACK).
 */
export async function withUser<T>(userId: string, fn: (db: DbSession) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(
      `select set_config('request.jwt.claims', $1, true),
              set_config('app.encryption_key', $2, true)`,
      [JSON.stringify({ sub: userId }), env.encryptionKey],
    )
    const result = await fn({ query: (text, values) => client.query(text, values) })
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
