# Module 1 Connector Setup Runbook

This repo is ready for live connector testing after the Base44 app is published and the Secrets below are set in the Base44 Dashboard. Do not put provider tokens in frontend code, entity records, screenshots, docs, or git.

Use `docs/MODULE_1_SECRETS_CHECKLIST.md` while gathering and entering provider credentials. It lists every required Secret, where it comes from, and the validation signal that proves it works.

## Base44

Backend function source lives in `base44/functions/` and `base44/shared/`. Base44 deploys `base44/functions.generated/`, which contains self-contained generated entries. Run `npm run check` before publishing; it rebuilds and validates the generated functions, parses provider fixtures, and dry-runs shared backend flow, webhook HMAC verification, send policy, and provider request payload construction without live provider keys.

1. Confirm the app is on Builder plan or higher.
2. Run `npm run check` locally.
3. Publish the current branch to Base44.
4. In the Base44 Dashboard, add the Secrets listed below.
5. Open the app as an admin user.
6. Go to `Omnichannel Setup`.
7. Copy each webhook URL from the setup card into the provider dashboard.
8. Run `Test connector` for each channel to validate required Secrets and provider API reachability.
9. Send a real inbound message through each provider webhook. A channel is only `Connected` after both send/API readiness and real inbound webhook evidence exist.
10. Use `Seed OMB demo` if you need a no-provider demo of the ticket cockpit and AI draft flow.

You can also print the exact provider callback URLs from the terminal. Use the published/default HTTPS Base44 function base, not localhost and not the `app.base44.com/.../editor/preview` URL. If Base44 gives you a base that includes `/api/apps/<app-id>`, keep that path:

```bash
npm run module1:webhook-urls -- https://YOUR-BASE44-APP
```

For the full live key/test session, generate the ordered operator checklist from `docs/MODULE_1_LIVE_TEST_CHECKLIST.json`:

```bash
npm run module1:live-checklist -- https://YOUR-BASE44-APP
```

To manually test provider GET verification after publish, generate a verification `curl`:

```bash
META_VERIFY_TOKEN='...' npm run module1:webhook-verify-curl -- meta 'https://YOUR-BASE44-APP/functions/receiveMetaWebhook?channel=facebook'
WHATSAPP_VERIFY_TOKEN='...' npm run module1:webhook-verify-curl -- whatsapp 'https://YOUR-BASE44-APP/functions/receiveWhatsAppWebhook'
```

Do not use `verifyMetaWebhook` or `verifyWhatsAppWebhook` as provider callback URLs. The `receiveMetaWebhook` and `receiveWhatsAppWebhook` URLs handle both provider GET verification and POST message delivery. The verify-only functions exist only as compatibility helpers.

Outbound sending is intentionally blocked until the relevant channel card has provider send readiness and a real inbound webhook. A failed re-test disables send readiness again until the connector passes. Seeded/demo conversations can show the inbox and AI draft workflow, but they do not prove provider credentials or enable live send.

Readiness model:

- `Send ready`: provider credentials/API test passed, but no real inbound webhook has been received yet.
- `Receive only`: a real inbound webhook was received, but provider send/API readiness has not passed.
- `Connected`: provider send/API readiness passed and a real inbound webhook has been received.
- `Seed OMB demo`: creates demo tickets/messages/drafts only; it must not change channel readiness.

Role model:

- Admin: can run connector tests, seed OMB demo data, generate AI drafts, and approve/send replies.
- Staff: can view connector health, generate AI drafts, and approve/send replies.
- Supplier/partner: cannot access the ticket/customer channel cockpit or call Module 1 draft/send/setup functions.

Expected local env for local preview is shown in `.env.example`. Copy it to `.env.local` and set the published/default HTTPS Base44 function base:

```bash
VITE_BASE44_APP_ID=6a1fcff6f516dd811c7315c7
VITE_BASE44_APP_BASE_URL=https://YOUR-BASE44-FUNCTION-BASE
```

Then verify it:

```bash
npm run local:env:check
```

Local dev can show the app shell without these values, but Base44 SDK calls will fail until the app base URL/token context exists.

## Email / Postmark

Secrets:

```text
POSTMARK_SERVER_TOKEN
POSTMARK_FROM_EMAIL
POSTMARK_INBOUND_WEBHOOK_SECRET
POSTMARK_MESSAGE_STREAM
```

`POSTMARK_MESSAGE_STREAM` is optional.

Provider setup:

1. Create or choose a Postmark Server.
2. Enable inbound processing.
3. Add the Email webhook URL from `Omnichannel Setup`.
4. Append `?secret=<POSTMARK_INBOUND_WEBHOOK_SECRET>` to the Postmark webhook URL.
5. If using inbound forwarding, forward the support inbox to the Postmark inbound address.
6. Enter a real test recipient email and run `Test connector`. Email outbound/send readiness is enabled only after Postmark sends this test email successfully.
7. Send a real email into Postmark inbound and confirm a `Ticket`, `ConversationMessage`, timeline entry, and `AiDraft` are created.

Functional notes:

- Inbound email is linked by `In-Reply-To`, `References`, or normalized sender plus subject.
- Outbound uses Postmark API send, not raw SMTP from the browser.
- Email send readiness is only enabled after the required test recipient email succeeds.
- The backend send function checks `ChannelAccount` readiness before calling Postmark; UI checks are not the only guard.
- Attachments are recorded as provider references for this prototype; binary attachment storage is not implemented yet.

## Facebook Messenger

Secrets:

```text
META_PAGE_ACCESS_TOKEN
META_PAGE_ID
META_VERIFY_TOKEN
META_APP_SECRET
```

Provider setup:

1. Use a Meta app connected to the target Facebook Page.
2. Add Messenger permissions and Page messaging access as required by Meta.
3. In Meta Webhooks, set the callback URL to the Facebook webhook URL from `Omnichannel Setup`.
4. Use `META_VERIFY_TOKEN` as the verification token.
5. Subscribe the Page to message events.
6. Run `Test connector`; this validates Meta credentials and marks the channel send-ready.
7. Send a real Page message and confirm it creates or updates a ticket. This marks receive readiness.

Functional notes:

- Webhook POSTs require `x-hub-signature-256`, validated with `META_APP_SECRET`.
- Outbound replies use the Meta Send API through `/me/messages` with the Page access token.
- The setup card only reaches `Connected` after the credential test passes and a real inbound webhook is received.
- The backend send function checks the Facebook `ChannelAccount` readiness before calling Meta; UI checks are not the only guard.
- AI is draft-only; the operator must approve every send, and backend send functions reject direct body-only calls without an approved `AiDraft`.

## Instagram Messaging

Secrets:

```text
META_PAGE_ACCESS_TOKEN
META_INSTAGRAM_ACCOUNT_ID
META_VERIFY_TOKEN
META_APP_SECRET
```

Provider setup:

1. Use an Instagram professional account connected to the Meta app/Page.
2. Confirm the app has the required Instagram Messaging permissions and review status for the target use case.
3. In Meta Webhooks, set the callback URL to the Instagram webhook URL from `Omnichannel Setup`.
4. Use `META_VERIFY_TOKEN` as the verification token.
5. Subscribe message events for Instagram.
6. Run `Test connector`; this validates Meta credentials and marks the channel send-ready.
7. Send a real Instagram message and confirm it creates or updates a ticket with an Instagram badge. This marks receive readiness.

Functional notes:

- Webhook POSTs require `x-hub-signature-256`, validated with `META_APP_SECRET`.
- Instagram and Facebook share the Meta send function but keep separate `channel_type` values.
- The setup card only reaches `Connected` after the credential test passes and a real inbound webhook is received.
- The backend send function checks the Instagram `ChannelAccount` readiness before calling Meta; UI checks are not the only guard.

## WhatsApp Cloud API

Secrets:

```text
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_VERIFY_TOKEN
META_APP_SECRET
```

Provider setup:

1. Configure the WhatsApp Cloud API phone number in Meta.
2. In WhatsApp Webhooks, set the callback URL to the WhatsApp webhook URL from `Omnichannel Setup`.
3. Use `WHATSAPP_VERIFY_TOKEN` as the verification token.
4. Subscribe to messages.
5. Run `Test connector`; this validates WhatsApp credentials and marks the channel send-ready.
6. Send a WhatsApp message to the business number and confirm it creates or updates a ticket. This marks receive readiness.
7. Test an operator reply inside the 24-hour service window.
8. For outside-window replies, enter an approved template name and language code in the AI draft panel before sending.

Functional notes:

- Webhook POSTs require `x-hub-signature-256`, validated with `META_APP_SECRET`.
- Free-form WhatsApp sends are blocked outside the service window unless a template name is provided.
- The setup card only reaches `Connected` after the credential test passes and a real inbound webhook is received.
- The backend send function checks WhatsApp `ChannelAccount` readiness before calling Meta; UI checks are not the only guard.
- Template parameter binding is not implemented yet; this prototype supports simple approved templates without variables.

## Acceptance Smoke Test

Run this after the Secrets are set:

1. `Omnichannel Setup` shows all four channel cards.
2. Each card can run `Test connector`.
3. Inbound email creates a ticket and AI draft.
4. Inbound Facebook message creates a ticket and AI draft.
5. Inbound Instagram message creates a ticket and AI draft.
6. Inbound WhatsApp message creates a ticket and AI draft.
7. Ticket detail shows the channel badge, AI summary, channel timeline entry, and AI draft panel.
8. Before send readiness plus real inbound readiness both exist, `Approve + Send` is blocked with a clear setup reason.
9. After send readiness plus real inbound readiness both exist, `Approve + Send` sends manually through the correct channel.
10. WhatsApp free-form send is allowed inside the 24-hour window.
11. WhatsApp outside-window send requires an approved template.
12. Backend send functions reject calls that do not include an approved `AiDraft`.
13. Failed or blocked provider sends create `send_attempt` timeline entries with `send_status=failed` or `send_status=blocked`.
14. Supplier and partner users cannot access the ticket/customer channel cockpit.

## Fixture Webhook Tests

Before publishing, run the no-key fixture parser check:

```bash
npm run module1:fixtures:check
```

After publishing the app and setting Secrets, you can generate provider-shaped webhook POST commands from local fixtures. This is faster than debugging provider dashboards first.

Postmark:

```bash
POSTMARK_INBOUND_WEBHOOK_SECRET='...' npm run module1:webhook-curl -- postmark \
  'https://YOUR-BASE44-APP/functions/receivePostmarkInbound' \
  fixtures/module1/postmark-inbound.json
```

Facebook Messenger:

```bash
META_APP_SECRET='...' npm run module1:webhook-curl -- meta \
  'https://YOUR-BASE44-APP/functions/receiveMetaWebhook?channel=facebook' \
  fixtures/module1/meta-facebook-message.json
```

Instagram:

```bash
META_APP_SECRET='...' npm run module1:webhook-curl -- meta \
  'https://YOUR-BASE44-APP/functions/receiveMetaWebhook?channel=instagram' \
  fixtures/module1/meta-instagram-message.json
```

Meta ignored events:

```bash
META_APP_SECRET='...' npm run module1:webhook-curl -- meta \
  'https://YOUR-BASE44-APP/functions/receiveMetaWebhook?channel=facebook' \
  fixtures/module1/meta-facebook-ignored-events.json
```

The ignored-events fixture should return `processed: 0` and must not create a ticket. It covers Meta echo, delivery, and read events.

WhatsApp:

```bash
META_APP_SECRET='...' npm run module1:webhook-curl -- whatsapp \
  'https://YOUR-BASE44-APP/functions/receiveWhatsAppWebhook' \
  fixtures/module1/whatsapp-message.json
```

The script prints a signed `curl` command. Run the printed command, then confirm the app creates or updates a ticket, `ConversationMessage`, timeline entry, and `AiDraft`.

## Current Prototype Limits

- No autonomous AI sending.
- No end-user OAuth; provider credentials are app-level Secrets.
- No binary attachment upload/storage for inbound provider attachments.
- No WhatsApp template variable UI yet.
- No Gmail/Microsoft OAuth or IMAP ingestion yet.
- No production SLA monitoring beyond latest connector test and last inbound/outbound timestamps.
