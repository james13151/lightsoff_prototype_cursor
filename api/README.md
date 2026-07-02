# LightsOff API (Phase 0)

Minimal Fastify service over the Phase 0 foundation schema. Its defining property: **it never implements the tenant boundary in application code.** Every request runs in a transaction that carries the caller's identity (`request.jwt.claims`, exactly how Supabase/PostgREST do it), and Postgres row-level security decides what the query can see or write. If the API has a bug, the blast radius is still one tenant.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness |
| POST | `/v1/tenants` | create tenant, caller becomes owner (chart of accounts auto-seeds) |
| GET | `/v1/tenants` | tenants the caller belongs to (+ role) |
| GET/POST | `/v1/vendors` | shared-entity CRUD |
| GET/POST | `/v1/products` | products + variants (Shopify sync will upsert these later) |
| GET/POST | `/v1/events` | the event bus: emit + poll (cursor on `seq`) |
| GET/POST | `/v1/credentials` | integration vault: store secrets, list metadata (plaintext is never returned over HTTP) |
| GET/POST | `/v1/purchase-orders` | POs with line items; `POST /:id/send` for draft→sent |
| GET/POST | `/v1/receipts` | create + finalize atomically: writes the inventory ledger, rolls PO status, flags discrepancies |
| GET | `/v1/stock` | live stock per variant from the inventory ledger |
| GET | `/v1/inventory-ledger` | append-only stock movement history |
| GET | `/v1/accounts` | chart of accounts with live balances |
| GET/POST | `/v1/journal` | journal entries (manual entries balance-checked by the DB) |
| GET/POST | `/v1/bills` | vendor bills; creation auto-posts expense ← AP to the journal |
| POST | `/v1/payments` | payment + allocations; auto-posts AP ← Cash, rolls bill status |
| GET/POST | `/v1/expense-claims` | petty-cash claims; `POST /:id/approve` and `/:id/reject` (admin-gated in the DB) |
| GET | `/v1/finance/summary` | cash, petty cash, AP, revenue, expenses, net profit — straight from the journal |

All `/v1/*` routes require a `Bearer` JWT (HS256, `sub` = user id).

## Run locally

Requires Postgres with the migration applied. From the repo root:

```bash
# 1. Provision a local database (creates roles, applies shim + migrations)
sudo -u postgres psql -c "create database lightsoff"
sudo -u postgres psql -d lightsoff -f supabase/tests/shim_auth.sql
sudo -u postgres psql -d lightsoff -f supabase/migrations/20260702000000_phase0_foundation.sql
sudo -u postgres psql -d lightsoff -c "create role lightsoff_api login password 'localdev' in role authenticated"
sudo -u postgres psql -d lightsoff -c "insert into auth.users (id, email) values (gen_random_uuid(), 'you@example.com') returning id"

# 2. Start the API
cd api && npm install
cp .env.example .env   # fill in values; DATABASE_URL uses the lightsoff_api role
npm run dev

# 3. Mint a dev token for the user id from step 1 and call the API
JWT_SECRET=<same-as-.env> node scripts/dev-token.mjs <user-uuid>
curl -X POST localhost:3001/v1/tenants -H "Authorization: Bearer <token>" \
  -H 'content-type: application/json' -d '{"name":"My Brand"}'
```

The SQL-level test suite (tenant isolation, append-only event bus, vault encryption) runs with:

```bash
sudo -u postgres bash supabase/tests/run_tests.sh
```

## Deploy

**Database → Supabase**

1. Create a Supabase project. Apply `supabase/migrations/*.sql` via the SQL editor or `supabase db push` (the CLI picks up the `supabase/migrations` directory as-is). Do **not** apply the test shim — Supabase provides `auth.users` and `auth.uid()` natively, and Supabase Auth becomes your signup/login for real users.
2. Create the dedicated API role so the service cannot bypass RLS:

```sql
create role lightsoff_api login password '...' in role authenticated;
```

**API → Railway / Fly.io / Render**

1. Deploy the `api/` directory (build: `npm run build`, start: `npm start`).
2. Environment variables:
   - `DATABASE_URL` — Supabase pooler connection string, **using the `lightsoff_api` role**, not `postgres`
   - `JWT_SECRET` — the project's JWT secret (Supabase → Settings → API), so tokens issued by Supabase Auth verify without extra glue
   - `APP_ENCRYPTION_KEY` — long random string; this is the vault key and exists only on the API host, never in the database

## Why this shape scales module by module

Phase 1 (Inventory + Finance) adds tables + policies in a new migration following the exact patterns already here: `tenant_id` column, `app.is_tenant_member()` policy, `updated_at` trigger, and an event-emitting trigger (see `app.vendors_emit_event`). The API grows one route file per module using `withUser()`. Cross-module automation (digest, OOS ad guard) consumes `app.events` — which is why it is append-only and cursor-friendly (`seq`).
