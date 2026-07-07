# lights:off / OMB PIT Base44 Prototype

This repository is the canonical GitHub/Base44 project for the lights:off prototype. The scratch planning repo at `/Users/karl/Documents/lights:off` should not be treated as an active implementation workspace after its docs have been copied here.

## About

View and edit the app on [Base44.com](http://Base44.com).

This project contains everything needed to run the app locally and publish changes back through Base44.

## Module 1: Omnichannel Setup

Module 1 adds a live connector setup layer for an AI-first omnichannel inbox:

- Email via Postmark inbound webhooks + outbound send.
- Facebook Messenger via Meta Page messaging.
- Instagram Messaging via Meta/Instagram messaging.
- WhatsApp Cloud API with service-window/template enforcement.
- AI draft generation through Base44 `InvokeLLM`.

Docs:

- `docs/LIGHTSOFF_STUDY_NOTES.md`
- `docs/MODULE_1_AI_OMNICHANNEL_CHAT_SPEC.md`
- `docs/MODULE_1_CONNECTOR_SETUP_RUNBOOK.md`
- `docs/MODULE_1_SECRETS_CHECKLIST.md`

## Base44 / GitHub Workflow

GitHub is the source of truth. Any change pushed to this repo can be reflected in the Base44 Builder, and any Base44 publish can generate changes back into this repo.

Conflict rule: do not have one person restructure screens/entities in Base44 while another person edits the same app locally. Publish/push Base44 work first, then pull locally before Codex or another engineer starts.

High-conflict areas:

- `src/pages/Home.jsx`
- `src/components/layout/*`
- `src/components/tickets/*`
- `base44/entities/*`
- `base44/functions/*`
- `base44/shared/*`
- `base44/functions.generated/*`

Backend function source lives in `base44/functions/` plus shared backend utilities in `base44/shared/`. Base44 deploys the self-contained generated entries in `base44/functions.generated/`, as configured by `base44/config.jsonc`. Do not edit generated function files directly; run `npm run functions:build` or `npm run check` after changing function source.

## Local Development

**Prerequisites:** 

1. Clone the repository using the project's Git URL 
2. Navigate to the project directory
3. Install dependencies: `npm install`
4. Create an `.env.local` file and set the right environment variables

```
VITE_BASE44_APP_ID=6a1fcff6f516dd811c7315c7
VITE_BASE44_APP_BASE_URL=https://your-published-base44-function-base
```

Run the app: `npm run dev`

For local setup, copy `.env.example` to `.env.local` and set the published/default HTTPS Base44 function base. If Base44 gives you a base that includes `/api/apps/<app-id>`, keep that path. Provider API keys still belong in Base44 Dashboard Secrets, not in local env files.

```bash
cp .env.example .env.local
# edit .env.local, then:
npm run local:env:check
```

To smoke-test the Module 1 setup UI locally before Base44 auth/function base is available, start Vite and open:

```bash
http://127.0.0.1:5173/module1-local-smoke?smoke_base_url=https://your-published-base44-function-base
```

That route is dev-only, read-only, and fixture-backed. It does not run live connector tests, seed data, bypass production auth, or write the real Base44 `app_base_url` setting.

Before publishing Module 1 changes, run `npm run check`. It covers lint, typecheck, Base44 function parsing, Module 1 preflight checks, provider fixture parsing, no-key backend flow checks, webhook HMAC verification, provider request payload shape checks, and production build.

To print the exact Module 1 provider callback URLs after publish, run this with the published/default HTTPS Base44 function base, not localhost and not the `app.base44.com/.../editor/preview` URL. If Base44 gives you a base that includes `/api/apps/<app-id>`, keep that path.

```
npm run module1:webhook-urls -- https://YOUR-BASE44-APP
```

For the full live key/test session, print the ordered operator checklist:

```bash
npm run module1:live-checklist -- https://YOUR-BASE44-APP
```

To manually test Meta/WhatsApp webhook GET verification after publish:

```bash
META_VERIFY_TOKEN='...' npm run module1:webhook-verify-curl -- meta 'https://YOUR-BASE44-APP/functions/receiveMetaWebhook?channel=facebook'
WHATSAPP_VERIFY_TOKEN='...' npm run module1:webhook-verify-curl -- whatsapp 'https://YOUR-BASE44-APP/functions/receiveWhatsAppWebhook'
```

## Publish Changes

Open [Base44.com](http://Base44.com) and click on Publish.

## Docs & Support

Documentation: [https://docs.base44.com/Integrations/Using-GitHub](https://docs.base44.com/Integrations/Using-GitHub)

Support: [https://app.base44.com/support](https://app.base44.com/support)
