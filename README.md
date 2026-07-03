# lightsoff_prototype_cursor

## Deploy (production)

**Supabase + GitHub Pages** — full guide: [docs/DEPLOY.md](docs/DEPLOY.md)

| Component | Host |
|-----------|------|
| Database + Auth | Supabase (free) |
| Frontend | GitHub Pages (free) |
| API | Render free tier (or Fly/Railway) |

## Repository layout

| Directory | What it is |
|---|---|
| [`lightsoff/`](lightsoff/) | Interactive UI prototype (Vite + React, in-memory state), now with native Module 1 omnichannel setup + inbox policy wiring |
| [`base44-prototype/`](base44-prototype/) | Migrated Base44 / OMB PIT prototype with Module 1 AI omnichannel setup |
| [`supabase/`](supabase/) | Phase 0 database foundation: multi-tenant schema, RLS policies, event bus, credential vault + SQL test suite |
| [`api/`](api/) | Phase 0 API service (Fastify + Postgres, RLS enforced end-to-end) — see its README for local dev and deployment |

## LightsOff prototype

An interactive prototype of the AI-driven brand operating system described in the product roadmap lives in [`lightsoff/`](lightsoff/). See its README for what it demonstrates and how to run it:

```bash
cd lightsoff
npm install
npm run dev
```

## Base44 Module 1 prototype

The previously built Base44 prototype has been migrated into [`base44-prototype/`](base44-prototype/) without rewriting this repo's existing Cursor/Supabase app. It contains the live-channel setup work for:

- Email via Postmark inbound webhook + outbound send.
- Facebook Messenger and Instagram Messaging via Meta.
- WhatsApp Cloud API with service-window/template enforcement.
- Base44 entities/functions for channel accounts, normalized messages, AI drafts, connector tests, send attempts, and OMB demo seeding.

Run and verify it from its own directory:

```bash
cd base44-prototype
npm install
npm run check
npm run dev
```

For local visual QA before Base44 auth/function-base setup, open:

```bash
http://127.0.0.1:5173/module1-local-smoke?smoke_base_url=https://your-published-base44-function-base
```

Provider API keys still belong in Base44 Dashboard Secrets, not in `.env` files. Use `base44-prototype/docs/MODULE_1_SECRETS_CHECKLIST.md` and `base44-prototype/docs/MODULE_1_CONNECTOR_SETUP_RUNBOOK.md` for the live setup session.

## Native Module 1 in Cursor app

The Cursor prototype in [`lightsoff/`](lightsoff/) also has Module 1 integrated into its own app shell:

- `Omnichannel Setup` is a System nav item with Email, Facebook Messenger, Instagram, and WhatsApp connector readiness cards.
- The Unified Inbox now reads native channel account, connector test, AI draft, and send-policy state.
- AI remains draft-only. Manual send is blocked unless the channel has live send + receive proof and the channel policy allows the reply.

The Cursor app tracks readiness and operator workflow. The actual live connector implementation from the earlier build remains in `base44-prototype/` until this repo gets a backend function runtime for those provider calls.
