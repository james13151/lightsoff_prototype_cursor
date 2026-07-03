# Deploy: Supabase + GitHub Pages

This guide sets up the **free-tier** production stack:

| Layer | Host | Cost |
|-------|------|------|
| Database + Auth | [Supabase](https://supabase.com) | Free (500 MB DB) |
| Frontend | [GitHub Pages](https://pages.github.com) | Free (public repo) |
| API | [Render](https://render.com) free web service | Free (spins down after ~15 min idle) |

GitHub Pages serves the static React app. Supabase hosts Postgres and user sign-in. The Fastify API (`api/`) must run on a small Node host because Pages cannot execute server code or hold database connections.

Without `VITE_API_URL` in the Pages build, the site runs in **demo mode** (in-memory data, no Connect screen). With all three secrets set, users sign in via Supabase and Inventory + Finance load from the real database.

---

## 1. Supabase project

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and link:

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

3. Apply migrations:

```bash
bash scripts/supabase-setup.sh
# or: supabase db push
```

4. In **SQL editor**, run [`supabase/setup-api-role.sql`](../supabase/setup-api-role.sql) — replace `CHANGE_ME_STRONG_PASSWORD` with a strong password.

5. From **Settings → API**, copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`
   - **JWT Secret** → `JWT_SECRET` on the API host

6. From **Settings → Database → Connection string** (pooler, port **6543**), build the API connection string using the `lightsoff_api` role:

```
postgres://lightsoff_api.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

7. **Authentication → Providers → Email** — enable email sign-up (disable email confirmation for quick prototyping under **Auth → Email** if you prefer instant sign-in).

---

## 2. API (Render free tier)

1. Push this repo to GitHub.
2. In [Render](https://dashboard.render.com) → **New → Blueprint** → connect the repo. Render reads [`render.yaml`](../render.yaml).
3. Set environment variables on the `lightsoff-api` service:
   - `DATABASE_URL` — pooler URL from step 1.6
   - `JWT_SECRET` — Supabase JWT secret from step 1.5
   - `APP_ENCRYPTION_KEY` — any long random string (Render can auto-generate)
   - `ALLOW_DEV_AUTH` — `false` (default in blueprint)
4. After deploy, copy the service URL (e.g. `https://lightsoff-api.onrender.com`) → `VITE_API_URL`.

**Cold starts:** the free tier sleeps after inactivity; the first request may take ~30s.

### Alternatives

Railway, Fly.io, or any Node 22 host works the same way: `cd api && npm run build && npm start` with the env vars above.

---

## 3. GitHub Pages (frontend)

### One-time repo settings

1. **Settings → Pages → Build and deployment → Source:** **GitHub Actions**
2. Repo must be **public** (GitHub Free Pages requirement).

### Secrets

**Settings → Secrets and variables → Actions → New repository secret:**

| Secret | Value |
|--------|-------|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon key from Supabase |
| `VITE_API_URL` | `https://lightsoff-api.onrender.com` (no trailing slash) |

Omit all three secrets to keep **demo-only** deploys (current default).

### Deploy

Push to `main` (touches `lightsoff/**`) or run **Actions → Deploy to GitHub Pages → Run workflow**.

Live URL: `https://<user>.github.io/<repo>/`

---

## 4. Verify

1. Open the Pages URL → **Connect** screen → sign up / sign in.
2. Create a workspace → **+ seed** to add sample vendor + SKU.
3. Open **Inventory** and **Finance** — data should load from Postgres.

API health check:

```bash
curl https://lightsoff-api.onrender.com/health
# {"ok":true,"service":"lightsoff-api","devAuth":false}
```

---

## Local development

Local dev does not use Supabase unless you set the `VITE_SUPABASE_*` vars. Default flow:

```bash
# Terminal 1 — Postgres + API
bash scripts/bootstrap-db.sh    # or docker compose + bootstrap --docker
cd api && cp .env.example .env && npm run dev

# Terminal 2 — Frontend
cd lightsoff && cp .env.example .env && npm run dev
```

Use **dev auth** on the Connect screen (`ALLOW_DEV_AUTH=true` on the API).

To test Supabase auth locally, copy production `VITE_SUPABASE_*` values into `lightsoff/.env` and set `VITE_API_URL` to your deployed API URL (or local API with matching `JWT_SECRET`).

---

## 4. Shopify integration

1. Apply migration `20260703070000_shopify_integration.sql` in Supabase SQL editor (after earlier migrations).
2. On the API host, set:
   - `API_PUBLIC_URL` — public base URL (e.g. `https://lightsoff-api.onrender.com`)
   - `SHOPIFY_API_SECRET` — custom app client secret (for webhook HMAC verification)
3. In the app: **Shopify** → connect store with Admin API access token (`read_orders`, `write_orders`, `read_products`).
4. Click **Register webhooks** then **Sync products** (maps variants by `shopify_variant_id`).
5. **Pull orders** or wait for `orders/create` webhooks — paid orders reserve stock in the inventory ledger.
6. **Mark shipped & sync to Shopify** pushes fulfillment + tracking back via the Fulfillment API.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Pages 404 | Settings → Pages → Source = GitHub Actions; repo public; re-run workflow |
| Actions build OK but **deploy failed, try again later** | Known intermittent GitHub Pages issue — re-run the workflow (Actions → Deploy to GitHub Pages → Re-run). The workflow retries deploy up to 3 times automatically. |
| Connect → CORS error | API must allow your Pages origin (`api/src/server.ts` uses `origin: true` for prototype) |
| 401 on API calls | `JWT_SECRET` on API must match Supabase JWT secret |
| 403 / empty data | User not a workspace member; create tenant after sign-in |
| API timeout on first load | Render free tier cold start — wait and retry |
| `lightsoff_api` connection fails | Use pooler port 6543; confirm role password matches `setup-api-role.sql` |
