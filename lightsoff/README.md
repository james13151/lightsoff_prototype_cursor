# LightsOff — Prototype

An interactive prototype of **LightsOff**, the AI-driven brand operating system for solo Shopify operators described in the product roadmap. One AI operator sits across inventory, money, marketing, customer conversations, R&D, and internal coordination — surfacing only what needs a human decision today.

## Run it

### Demo mode (in-memory, no backend)

```bash
npm install
npm run dev
```

Open `http://localhost:5173` — uses seeded data, no database required.

### Live mode (Inventory + Finance from real API/DB)

**Terminal 1 — API** (from repo root, Postgres with migrations applied):

```bash
cd api && npm install
cp .env.example .env   # set DATABASE_URL, JWT_SECRET, APP_ENCRYPTION_KEY, ALLOW_DEV_AUTH=true
npm run dev
```

**Terminal 2 — Frontend:**

```bash
cd lightsoff && npm install
cp .env.example .env   # VITE_API_URL=/api (Vite proxies to localhost:3001)
npm run dev
```

Open `http://localhost:5173` → **Connect** screen → pick or create a workspace → click **+ seed** to add a vendor + SKU.

- **Inventory, Finance, Event Bus** load from Postgres via the API
- **Inbox, Marketing, R&D, Collab** remain demo data until Phase 2/3
- Sidebar shows `Live — Inventory + Finance from DB` when connected

For production: see [docs/DEPLOY.md](../docs/DEPLOY.md) — **Supabase** (DB + Auth) + **GitHub Pages** (frontend) + **Render** (API free tier).

## GitHub Pages (demo deploy)

**Live URL:** https://james13151.github.io/lightsoff_prototype_cursor/

Pushes to `main` that touch `lightsoff/**` auto-deploy via `.github/workflows/deploy-pages.yml`.

If the site returns **404**, the deploy workflow may still be green — check these repo settings:

1. **Settings → Pages → Build and deployment → Source:** must be **GitHub Actions** (not "Deploy from a branch").
2. **Repository visibility:** GitHub Free only serves Pages from **public** repos. Private repos need GitHub Pro (or make the repo public).
3. After changing settings, re-run the workflow: **Actions → Deploy to GitHub Pages → Run workflow**.

The workflow builds with `--base=/lightsoff_prototype_cursor/` and includes a `404.html` SPA fallback.

**Live mode on Pages:** set GitHub Actions secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_URL` — see [docs/DEPLOY.md](../docs/DEPLOY.md). Without those secrets the site runs in demo mode only.

## What's in the prototype

The three UX surfaces from the spec:

1. **Capture** — the always-available "drop anything here" bar at the top. Type things like:
   - `Received 50 blue hoodies from Acme` → drafts an inventory receipt, matches it to the open PO, pushes stock to Shopify (simulated)
   - `Forwarded invoice from Pacific Trims for $560` → extracts a vendor bill into Finance
   - `Paid $18.40 for courier shipping to Uber` → expense claim; auto-applies or pauses depending on your confidence threshold
   - `Customer asking if the red one is back in stock` → routes to the Inbox with an AI-drafted reply grounded in live stock
   - `Sample arrived from Kyoto Fabric Lab — corduroy swatch` → sample receipt + auto-created R&D kanban card
   - Anything unrecognized → filed as an internal ticket so nothing gets lost

2. **Daily Digest** — the home screen. One prioritized feed across all six modules: low stock with AI reorder suggestions, bills due, escalated conversations, OOS-paused campaigns ready to resume, aging samples, and tickets awaiting you. Every item is actionable inline.

3. **Drill-down views** — traditional module screens (stock table, PO/receipt lists, journal, unified inbox, campaign list, kanban board, ticket list) for verification and edge cases.

Cross-module wiring demonstrated live:

- Paying a bill auto-posts a double-entry journal entry (Finance ← Inventory AP event)
- A captured sample receipt auto-creates an R&D kanban card (R&D ← Inventory event)
- The OOS ad guard holds a campaign while its SKU is out of stock, and surfaces a resume approval in the digest once restocked (Marketing ← Inventory events)
- Low-confidence expense claims route to an Internal Collab approval ticket; approving the ticket posts the journal entry and resolves the ticket (Collab ↔ Finance)
- Every action publishes to the **Event Bus** view — the append-only feed the digest is built on

Confidence-aware automation (spec §1.5) is adjustable in **AI Settings**: the auto-apply threshold changes whether a captured expense auto-posts (with an undo window) or pauses for approval.

## What's simulated

- The AI classifier (`src/ai/classify.ts`) is deterministic rules standing in for an LLM call
- **Phase 2/3 modules** (Inbox, Marketing, R&D, Collab) use in-memory seed data even in live mode
- Shopify / Meta / WhatsApp integrations are not connected yet
- In demo mode (no `VITE_API_URL`), all state is in-memory and resets on refresh

## Stack

Vite + React 19 + TypeScript + Tailwind CSS v4. No backend — the entity model from spec §7 lives in `src/types.ts`, seeded demo data in `src/data/seed.ts`, and all state transitions in a single reducer (`src/store.tsx`).
