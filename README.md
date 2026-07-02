# lightsoff_prototype_cursor

## Repository layout

| Directory | What it is |
|---|---|
| [`lightsoff/`](lightsoff/) | Interactive UI prototype (Vite + React, in-memory state) |
| [`supabase/`](supabase/) | Phase 0 database foundation: multi-tenant schema, RLS policies, event bus, credential vault + SQL test suite |
| [`api/`](api/) | Phase 0 API service (Fastify + Postgres, RLS enforced end-to-end) — see its README for local dev and deployment |

## LightsOff prototype

An interactive prototype of the AI-driven brand operating system described in the product roadmap lives in [`lightsoff/`](lightsoff/). See its README for what it demonstrates and how to run it:

```bash
cd lightsoff
npm install
npm run dev
```
