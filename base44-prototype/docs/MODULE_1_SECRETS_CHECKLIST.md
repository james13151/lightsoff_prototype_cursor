# Module 1 Secrets Checklist

Use this as the setup sheet when adding live provider keys in the Base44 Dashboard. Do not paste real values into this file, Slack, screenshots, entity records, or frontend code.

## Base44 Dashboard

Add Secrets in the Base44 app dashboard after publishing this branch.

Required local/public env for local preview:

```text
VITE_BASE44_APP_ID=6a1fcff6f516dd811c7315c7
VITE_BASE44_APP_BASE_URL=https://YOUR-BASE44-FUNCTION-BASE
```

Use the published/default HTTPS Base44 function base. If Base44 gives you a base that includes `/api/apps/<app-id>`, keep that path. Never use localhost or the editor preview URL here.

Provider credentials below are Base44 Dashboard Secrets only.

## Email / Postmark

Create these Secrets:

- `POSTMARK_SERVER_TOKEN`
- `POSTMARK_FROM_EMAIL`
- `POSTMARK_INBOUND_WEBHOOK_SECRET`
- `POSTMARK_MESSAGE_STREAM`

Where they come from:

- `POSTMARK_SERVER_TOKEN`: Postmark Server API token.
- `POSTMARK_FROM_EMAIL`: verified sender identity used for support replies.
- `POSTMARK_INBOUND_WEBHOOK_SECRET`: random shared secret you create for the inbound webhook URL.
- `POSTMARK_MESSAGE_STREAM`: optional Postmark message stream id.

Validation:

1. In `Omnichannel Setup`, enter a real recipient in the Email test field.
2. Run `Test connector`.
3. The test must send through Postmark before Email becomes send-ready.
4. Send a real inbound email into Postmark and confirm a ticket, channel message, timeline entry, and AI draft are created.

## Facebook Messenger

Create these Secrets:

- `META_PAGE_ACCESS_TOKEN`
- `META_PAGE_ID`
- `META_VERIFY_TOKEN`
- `META_APP_SECRET`

Where they come from:

- `META_PAGE_ACCESS_TOKEN`: Meta Page access token with Messenger/Page messaging access.
- `META_PAGE_ID`: target Facebook Page id.
- `META_VERIFY_TOKEN`: random verification token you create and paste into the Meta webhook verification field.
- `META_APP_SECRET`: Meta app secret used to verify `x-hub-signature-256` webhook POSTs.

Validation:

1. Run `Test connector` on Facebook Messenger.
2. Meta credential lookup must pass.
3. Send a real Page message to the business Page.
4. The Facebook card becomes `Connected` only after both send readiness and inbound webhook evidence exist.

## Instagram Messaging

Create these Secrets:

- `META_PAGE_ACCESS_TOKEN`
- `META_INSTAGRAM_ACCOUNT_ID`
- `META_VERIFY_TOKEN`
- `META_APP_SECRET`

Where they come from:

- `META_PAGE_ACCESS_TOKEN`: token for the connected Page/Instagram messaging setup.
- `META_INSTAGRAM_ACCOUNT_ID`: Instagram professional account id.
- `META_VERIFY_TOKEN`: same verification token used for Meta webhook setup.
- `META_APP_SECRET`: same Meta app secret used for signed webhook validation.

Validation:

1. Run `Test connector` on Instagram.
2. Meta credential lookup must pass for the Instagram account id.
3. Send a real Instagram message.
4. The ticket must preserve `channel_type=instagram` and show the Instagram badge.

## WhatsApp Cloud API

Create these Secrets:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `META_APP_SECRET`

Where they come from:

- `WHATSAPP_ACCESS_TOKEN`: WhatsApp Cloud API access token.
- `WHATSAPP_PHONE_NUMBER_ID`: WhatsApp Cloud API phone number id.
- `WHATSAPP_VERIFY_TOKEN`: random verification token you create for WhatsApp webhook setup.
- `META_APP_SECRET`: Meta app secret used to verify WhatsApp webhook signatures.

Validation:

1. Run `Test connector` on WhatsApp.
2. WhatsApp phone-number lookup must pass.
3. Send a real WhatsApp message to the business number.
4. Reply inside the 24-hour window with a normal draft.
5. For outside-window replies, use an approved template name and language code in the AI draft panel.

## Callback URLs

After publishing, print callback URLs with the published/default HTTPS Base44 function base. Do not use localhost or the `app.base44.com/.../editor/preview` URL. If Base44 gives you a base that includes `/api/apps/<app-id>`, keep that path:

```bash
npm run module1:webhook-urls -- https://YOUR-BASE44-APP
```

For a complete live setup/testing run, print the ordered checklist:

```bash
npm run module1:live-checklist -- https://YOUR-BASE44-APP
```

To manually test Meta/WhatsApp webhook GET verification after publish:

```bash
META_VERIFY_TOKEN='...' npm run module1:webhook-verify-curl -- meta 'https://YOUR-BASE44-APP/functions/receiveMetaWebhook?channel=facebook'
WHATSAPP_VERIFY_TOKEN='...' npm run module1:webhook-verify-curl -- whatsapp 'https://YOUR-BASE44-APP/functions/receiveWhatsAppWebhook'
```

Paste the `receive*` URLs into provider dashboards:

- Postmark: `receivePostmarkInbound`
- Facebook: `receiveMetaWebhook?channel=facebook`
- Instagram: `receiveMetaWebhook?channel=instagram`
- WhatsApp: `receiveWhatsAppWebhook`

Do not use `verifyMetaWebhook` or `verifyWhatsAppWebhook` as callbacks. They are compatibility helpers only.

## Fixture Tests

Before publishing, run the no-key fixture parser check:

```bash
npm run module1:fixtures:check
```

After Secrets are set, use signed fixture curl commands from:

```bash
npm run module1:webhook-curl -- <postmark|meta|whatsapp> <webhook-url> <fixture-json>
```

Fixtures live in `fixtures/module1/`. They prove payload parsing and signature handling before debugging provider dashboards.
