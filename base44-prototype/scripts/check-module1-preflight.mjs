import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];

function fail(message) {
  errors.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertFile(relativePath) {
  if (!fs.existsSync(path.join(root, relativePath))) fail(`Missing ${relativePath}`);
}

function assertIncludes(relativePath, expected, message) {
  const source = read(relativePath);
  if (!source.includes(expected)) fail(message || `${relativePath} missing ${expected}`);
}

function assertNotIncludes(relativePath, forbidden, message) {
  const source = read(relativePath);
  if (source.includes(forbidden)) fail(message || `${relativePath} contains forbidden ${forbidden}`);
}

function assertJson(relativePath) {
  try {
    JSON.parse(read(relativePath));
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error.message}`);
  }
}

const entities = [
  'base44/entities/ChannelAccount.jsonc',
  'base44/entities/ConversationMessage.jsonc',
  'base44/entities/AiDraft.jsonc',
  'base44/entities/ConnectorTestRun.jsonc',
];

const functions = [
  'base44/functions/createAiDraftForTicket/entry.ts',
  'base44/functions/receiveMetaWebhook/entry.ts',
  'base44/functions/receivePostmarkInbound/entry.ts',
  'base44/functions/receiveWhatsAppWebhook/entry.ts',
  'base44/functions/seedOmbDemoData/entry.ts',
  'base44/functions/sendEmailReply/entry.ts',
  'base44/functions/sendMetaReply/entry.ts',
  'base44/functions/sendWhatsAppReply/entry.ts',
  'base44/functions/testEmailConnector/entry.ts',
  'base44/functions/testMetaConnector/entry.ts',
  'base44/functions/testWhatsAppConnector/entry.ts',
  'base44/functions/verifyMetaWebhook/entry.ts',
  'base44/functions/verifyWhatsAppWebhook/entry.ts',
];

const looseFunctionFiles = fs.readdirSync(path.join(root, 'base44/functions'), { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(ts|js)$/.test(entry.name))
  .map((entry) => entry.name);
if (looseFunctionFiles.length) {
  fail(`base44/functions contains loose deploy-hostile helper files: ${looseFunctionFiles.join(', ')}`);
}

const fixtures = [
  'fixtures/module1/postmark-inbound.json',
  'fixtures/module1/meta-facebook-message.json',
  'fixtures/module1/meta-facebook-ignored-events.json',
  'fixtures/module1/meta-instagram-message.json',
  'fixtures/module1/whatsapp-message.json',
];

[
  '.env.example',
  'base44/config.jsonc',
  'docs/MODULE_1_CONNECTOR_SETUP_RUNBOOK.md',
  'docs/MODULE_1_SECRETS_CHECKLIST.md',
  'docs/MODULE_1_LIVE_TEST_CHECKLIST.json',
  'docs/MODULE_1_AI_OMNICHANNEL_CHAT_SPEC.md',
  'docs/LIGHTSOFF_STUDY_NOTES.md',
  'src/pages/OmnichannelSetup.jsx',
  'src/components/tickets/AiDraftPanel.jsx',
  'src/components/tickets/ChannelBadge.jsx',
  'src/api/omnichannel.js',
  'base44/shared/omniShared.ts',
  'base44/functions.generated/sendEmailReply/entry.ts',
  'base44/functions.generated/sendMetaReply/entry.ts',
  'base44/functions.generated/sendWhatsAppReply/entry.ts',
  'scripts/check-local-base44-env.mjs',
  'scripts/module1-webhook-curl.mjs',
  'scripts/module1-webhook-verify-curl.mjs',
  'scripts/module1-live-checklist.mjs',
  'scripts/module1-webhook-urls.mjs',
  'scripts/check-module1-fixtures.mjs',
  'scripts/check-module1-flow.mjs',
  ...entities,
  ...functions,
  ...fixtures,
].forEach(assertFile);

entities.forEach(assertJson);
fixtures.forEach(assertJson);
assertJson('docs/MODULE_1_LIVE_TEST_CHECKLIST.json');

assertIncludes('base44/config.jsonc', '"name": "lights-off-prototype"', 'Base44 config should use the canonical project name');
assertIncludes('base44/config.jsonc', '"functionsDir": "./functions.generated"', 'Base44 config must deploy generated self-contained function entries');
assertIncludes('README.md', 'Do not edit generated function files directly', 'README must document generated function deploy workflow');
assertIncludes('docs/MODULE_1_CONNECTOR_SETUP_RUNBOOK.md', 'Base44 deploys `base44/functions.generated/`', 'Runbook must document generated function deploy workflow');

assertIncludes('base44/functions/sendEmailReply/entry.ts', 'requireChannelSendReady(base44, \'email\')', 'Email send must enforce backend connector readiness');
assertIncludes('base44/functions/sendMetaReply/entry.ts', 'requireChannelSendReady(base44, channelType)', 'Meta send must enforce backend connector readiness');
assertIncludes('base44/functions/sendMetaReply/entry.ts', "channelType === 'instagram' ? env('META_INSTAGRAM_ACCOUNT_ID') : 'me'", 'Instagram sends must use the configured Instagram account sender node');
assertIncludes('base44/functions/testMetaConnector/entry.ts', 'channel_type must be facebook or instagram', 'Meta connector test must reject invalid channel types');
assertIncludes('base44/functions/sendWhatsAppReply/entry.ts', 'requireChannelSendReady(base44, \'whatsapp\')', 'WhatsApp send must enforce backend connector readiness');
assertIncludes('base44/functions/sendWhatsAppReply/entry.ts', 'blocked_whatsapp_template_required', 'WhatsApp send must block outside-window free-form sends');
assertIncludes('base44/functions/testEmailConnector/entry.ts', 'Email test recipient required to prove outbound send readiness', 'Email connector test must require an outbound proof recipient');
assertIncludes('src/pages/OmnichannelSetup.jsx', 'Required test recipient email', 'Email setup UI must require a test recipient for outbound proof');
assertIncludes('base44/shared/omniShared.ts', 'assertTicketChannel', 'Shared send helper must validate ticket channel');
assertIncludes('base44/shared/omniShared.ts', 'loadLinkedDraft', 'Shared send helper must validate AI draft ownership/channel');
assertIncludes('base44/shared/omniShared.ts', 'recordSendAttempt', 'Shared send helper must log send attempt audit entries');
assertIncludes('base44/shared/omniShared.ts', 'buildPostmarkEmailRequest', 'Shared helper must build Postmark request payloads');
assertIncludes('base44/shared/omniShared.ts', 'buildMetaMessageRequest', 'Shared helper must build Meta request payloads');
assertIncludes('base44/shared/omniShared.ts', 'buildWhatsAppMessageRequest', 'Shared helper must build WhatsApp request payloads');
assertIncludes('base44/shared/omniShared.ts', 'AI draft id required for beta send policy', 'Shared send helper must reject direct body-only sends');
assertIncludes('base44/shared/omniShared.ts', 'AI draft must be approved before sending', 'Shared send helper must require manual draft approval before provider sends');
assertIncludes('base44/entities/TimelineEntry.jsonc', '"send_status"', 'TimelineEntry must store send attempt result status');

[
  'base44/functions/sendEmailReply/entry.ts',
  'base44/functions/sendMetaReply/entry.ts',
  'base44/functions/sendWhatsAppReply/entry.ts',
].forEach((relativePath) => {
  assertIncludes(relativePath, 'assertTicketChannel(ticket', `${relativePath} must verify the ticket channel before sending`);
  assertIncludes(relativePath, 'loadLinkedDraft(base44', `${relativePath} must verify the AI draft belongs to the ticket/channel before sending`);
  assertIncludes(relativePath, 'recordSendAttempt', `${relativePath} must log failed/blocked send attempts`);
  assertIncludes(relativePath, '../../shared/omniShared.ts', `${relativePath} must import shared backend helpers from base44/shared`);
});
assertIncludes('base44/functions/sendEmailReply/entry.ts', 'buildPostmarkEmailRequest', 'Email send must use the tested Postmark request builder');
assertIncludes('base44/functions/sendMetaReply/entry.ts', 'buildMetaMessageRequest', 'Meta send must use the tested Meta request builder');
assertIncludes('base44/functions/sendWhatsAppReply/entry.ts', 'buildWhatsAppMessageRequest', 'WhatsApp send must use the tested WhatsApp request builder');

[
  'base44/functions/sendEmailReply/entry.ts',
  'base44/functions/sendMetaReply/entry.ts',
  'base44/functions/sendWhatsAppReply/entry.ts',
  'base44/functions/createAiDraftForTicket/entry.ts',
].forEach((relativePath) => {
  assertIncludes(relativePath, "req.method !== 'POST'", `${relativePath} must reject unsupported methods`);
  assertIncludes(relativePath, 'requireStaffOperator(base44)', `${relativePath} must be limited to admin/staff operators`);
  assertIncludes(relativePath, 'statusForError(error)', `${relativePath} must return 401/403 correctly`);
});

[
  'base44/functions/testEmailConnector/entry.ts',
  'base44/functions/testMetaConnector/entry.ts',
  'base44/functions/testWhatsAppConnector/entry.ts',
  'base44/functions/seedOmbDemoData/entry.ts',
].forEach((relativePath) => {
  assertIncludes(relativePath, "req.method !== 'POST'", `${relativePath} must reject unsupported methods`);
  assertIncludes(relativePath, 'requireAdmin(base44)', `${relativePath} must be admin-only`);
  assertIncludes(relativePath, 'statusForError(error)', `${relativePath} must return 401/403 correctly`);
});

assertIncludes('base44/functions/receiveMetaWebhook/entry.ts', 'verifyMetaSignature(req, rawBody)', 'Meta inbound webhook must verify x-hub-signature-256');
assertIncludes('base44/functions/receiveMetaWebhook/entry.ts', 'req.method !== \'POST\'', 'Meta inbound webhook must reject unsupported methods after GET verification');
assertIncludes('base44/functions/receiveMetaWebhook/entry.ts', '!event.message.is_echo', 'Meta inbound webhook must ignore echoed outbound messages');
assertIncludes('base44/functions/receiveMetaWebhook/entry.ts', '(!inboundMessage && !postback)', 'Meta inbound webhook must ignore delivery/read events');
assertIncludes('base44/functions/receiveMetaWebhook/entry.ts', 'channel must be facebook or instagram', 'Meta inbound webhook must validate forced channel query');
assertIncludes('base44/functions/receiveWhatsAppWebhook/entry.ts', 'verifyMetaSignature(req, rawBody)', 'WhatsApp inbound webhook must verify x-hub-signature-256');
assertIncludes('base44/functions/receiveWhatsAppWebhook/entry.ts', 'req.method !== \'POST\'', 'WhatsApp inbound webhook must reject unsupported methods after GET verification');
assertIncludes('base44/functions/receivePostmarkInbound/entry.ts', 'POSTMARK_INBOUND_WEBHOOK_SECRET', 'Postmark inbound webhook must verify shared secret');
assertIncludes('base44/functions/receivePostmarkInbound/entry.ts', 'req.method !== \'POST\'', 'Postmark inbound webhook must reject unsupported methods');

assertIncludes('src/api/omnichannel.js', "webhookFunction: 'receiveMetaWebhook'", 'Frontend must expose receiveMetaWebhook as the Meta provider callback URL');
assertIncludes('src/api/omnichannel.js', "webhookFunction: 'receiveWhatsAppWebhook'", 'Frontend must expose receiveWhatsAppWebhook as the WhatsApp provider callback URL');
assertIncludes('src/api/omnichannel.js', 'getFunctionBaseWarning', 'Frontend must guard against invalid webhook callback base URLs');
assertIncludes('src/api/omnichannel.js', "url.hostname === 'app.base44.com'", 'Frontend must reject Base44 editor host as webhook callback base');
assertIncludes('src/api/omnichannel.js', "['localhost', '127.0.0.1', '::1'].includes(url.hostname)", 'Frontend must reject local development URLs as webhook callback bases');
assertIncludes('src/api/omnichannel.js', "url.protocol !== 'https:'", 'Frontend must require HTTPS callback bases');
assertIncludes('src/pages/OmnichannelSetup.jsx', 'disabled={!webhookUrl}', 'Setup UI must not copy invalid webhook URLs');
assertIncludes('src/pages/OmnichannelSetup.jsx', 'published function base', 'Setup UI must guide admins toward published function callback bases');
assertIncludes('src/pages/OmnichannelSetup.jsx', 'accountsOverride', 'Setup UI must support read-only fixture data for local smoke testing');
assertIncludes('src/pages/OmnichannelSetup.jsx', 'readOnly || isTesting', 'Setup UI smoke mode must disable connector actions');
assertIncludes('src/pages/OmnichannelSetup.jsx', 'functionBaseOverride', 'Setup UI smoke mode must not depend on persisted Base44 app base params');
assertIncludes('src/App.jsx', "window.location.pathname === '/module1-local-smoke'", 'App must expose the dev-only Module 1 smoke route');
assertIncludes('src/App.jsx', 'import.meta.env.DEV', 'Module 1 smoke route must be dev-only');
assertIncludes('src/pages/Module1LocalSmoke.jsx', 'Module 1 Smoke Admin', 'Module 1 smoke page must render as an admin fixture');
assertIncludes('src/pages/Module1LocalSmoke.jsx', 'smoke_base_url', 'Module 1 smoke page must use smoke_base_url instead of app_base_url');
assertIncludes('README.md', '/module1-local-smoke', 'README must document the local Module 1 smoke route');
assertIncludes('README.md', 'smoke_base_url', 'README must document smoke_base_url so local smoke testing does not pollute app_base_url');
assertNotIncludes('src/api/omnichannel.js', "webhookFunction: 'verifyMetaWebhook'", 'Frontend must not expose verifyMetaWebhook as a provider callback URL');
assertNotIncludes('src/api/omnichannel.js', "webhookFunction: 'verifyWhatsAppWebhook'", 'Frontend must not expose verifyWhatsAppWebhook as a provider callback URL');
assertIncludes('docs/MODULE_1_CONNECTOR_SETUP_RUNBOOK.md', 'Do not use `verifyMetaWebhook` or `verifyWhatsAppWebhook`', 'Runbook must warn against verify-only callback URLs');
assertIncludes('docs/MODULE_1_CONNECTOR_SETUP_RUNBOOK.md', 'not the `app.base44.com/.../editor/preview` URL', 'Runbook must warn against editor preview callback base URLs');
assertIncludes('docs/MODULE_1_SECRETS_CHECKLIST.md', 'Provider credentials below are Base44 Dashboard Secrets only', 'Secrets checklist must keep provider credentials out of frontend/local env');
assertIncludes('docs/MODULE_1_SECRETS_CHECKLIST.md', 'POSTMARK_INBOUND_WEBHOOK_SECRET', 'Secrets checklist must include Postmark inbound secret');
assertIncludes('docs/MODULE_1_SECRETS_CHECKLIST.md', 'META_APP_SECRET', 'Secrets checklist must include Meta app secret');
assertIncludes('docs/MODULE_1_SECRETS_CHECKLIST.md', 'WHATSAPP_PHONE_NUMBER_ID', 'Secrets checklist must include WhatsApp phone number id');
assertIncludes('scripts/module1-webhook-urls.mjs', 'Do not use verifyMetaWebhook or verifyWhatsAppWebhook', 'Webhook URL printer must warn against verify-only callback URLs');
assertIncludes('scripts/module1-webhook-urls.mjs', 'Do not pass the Base44 editor preview URL', 'Webhook URL printer must reject editor preview URLs');
assertIncludes('scripts/module1-webhook-urls.mjs', 'Do not pass a local or non-HTTPS URL', 'Webhook URL printer must reject local/non-HTTPS callback bases');
assertIncludes('scripts/module1-webhook-urls.mjs', 'baseUrl.pathname.replace(/\\/$/, \'\')', 'Webhook URL printer must preserve non-editor Base44 base paths');
assertIncludes('scripts/module1-live-checklist.mjs', 'Module 1 Live Connector Checklist', 'Live connector checklist printer must exist');
assertIncludes('scripts/module1-live-checklist.mjs', 'module1:webhook-curl', 'Live checklist must include fixture curl templates');
assertIncludes('scripts/module1-live-checklist.mjs', 'module1:webhook-verify-curl', 'Live checklist must include provider GET verification curl templates');
assertIncludes('scripts/module1-webhook-verify-curl.mjs', 'hub.mode', 'Webhook verification curl helper must generate provider GET verification query');
assertIncludes('scripts/module1-webhook-verify-curl.mjs', 'hub.challenge', 'Webhook verification curl helper must include challenge query');
assertIncludes('scripts/module1-webhook-verify-curl.mjs', 'WHATSAPP_VERIFY_TOKEN', 'Webhook verification curl helper must support WhatsApp verify token');
assertIncludes('package.json', 'module1:webhook-verify-curl', 'Package scripts must expose webhook verification curl helper');
assertIncludes('docs/MODULE_1_LIVE_TEST_CHECKLIST.json', '"negative_tests"', 'Live checklist must include negative tests');
assertIncludes('docs/MODULE_1_LIVE_TEST_CHECKLIST.json', '"direct-body-send"', 'Live checklist must cover direct body-only send rejection');
assertIncludes('docs/MODULE_1_LIVE_TEST_CHECKLIST.json', '"channel_type": "facebook"', 'Live checklist negative fixture must target the Facebook callback explicitly');
assertIncludes('package.json', 'module1:live-checklist', 'Package scripts must expose live connector checklist');
assertIncludes('scripts/check-local-base44-env.mjs', 'Local Base44 env looks ready', 'Local Base44 env checker must exist');
assertIncludes('package.json', 'local:env:check', 'Package scripts must expose local Base44 env verification');
assertIncludes('scripts/check-module1-fixtures.mjs', 'Module 1 fixture parser check passed', 'Fixture parser check must exist');
assertIncludes('scripts/check-module1-fixtures.mjs', 'demo-whatsapp-message-001', 'Fixture parser check must verify WhatsApp sample ids');
assertIncludes('package.json', 'module1:fixtures:check', 'Package check must include fixture parser validation');
assertIncludes('scripts/check-module1-flow.mjs', 'Module 1 flow check passed', 'Flow check must exist');
assertIncludes('scripts/check-module1-flow.mjs', 'verifyMetaSignature(signedRequest, rawBody)', 'Flow check must verify signed Meta/WhatsApp webhook HMAC handling');
assertIncludes('scripts/check-module1-flow.mjs', 'Missing x-hub-signature-256 header', 'Flow check must cover missing webhook signature header');
assertIncludes('scripts/check-module1-flow.mjs', 'Missing Secret: META_APP_SECRET', 'Flow check must cover missing webhook signature secret');
assertIncludes('scripts/check-module1-flow.mjs', 'createInboundConversation(client, input)', 'Flow check must exercise real inbound conversation creation');
assertIncludes('scripts/check-module1-flow.mjs', 'recordConnectorTest(client', 'Flow check must exercise readiness transitions');
assertIncludes('scripts/check-module1-flow.mjs', 'loadLinkedDraft(client', 'Flow check must exercise draft send policy');
assertIncludes('scripts/check-module1-flow.mjs', 'recordSendAttempt(client', 'Flow check must exercise failed/blocked send-attempt audit logging');
assertIncludes('scripts/check-module1-flow.mjs', 'buildPostmarkEmailRequest', 'Flow check must verify Postmark provider request shape');
assertIncludes('scripts/check-module1-flow.mjs', 'buildMetaMessageRequest', 'Flow check must verify Meta provider request shape');
assertIncludes('scripts/check-module1-flow.mjs', 'buildWhatsAppMessageRequest', 'Flow check must verify WhatsApp provider request shape');
assertIncludes('scripts/check-module1-flow.mjs', "send_status, 'sent'", 'Flow check must prove successful send attempts are marked sent');
assertIncludes('package.json', 'module1:flow:check', 'Package check must include backend flow validation');

assertIncludes('base44/shared/omniShared.ts', 'setupStatusForReadiness', 'Shared readiness state machine is missing');
assertIncludes('base44/shared/omniShared.ts', 'if (testType === \'outbound\')', 'Outbound failure/success must be handled separately');
assertIncludes('base44/shared/omniShared.ts', 'if (testType === \'webhook\' || testType === \'inbound\')', 'Webhook/inbound readiness must be handled separately');
assertIncludes('base44/shared/omniShared.ts', 'input.demo_mode', 'Demo seed path must be explicitly separated from live readiness');
assertIncludes('base44/functions/seedOmbDemoData/entry.ts', 'demo_mode: true', 'OMB demo seed must not mutate live connector readiness');

[
  'base44/functions/testEmailConnector/entry.ts',
  'base44/functions/testMetaConnector/entry.ts',
  'base44/functions/testWhatsAppConnector/entry.ts',
  'base44/functions/seedOmbDemoData/entry.ts',
].forEach((relativePath) => {
  assertNotIncludes(relativePath, "setup_status: 'connected'", `${relativePath} must not hard-code full connected readiness`);
  assertNotIncludes(relativePath, 'setup_status: "connected"', `${relativePath} must not hard-code full connected readiness`);
  assertNotIncludes(relativePath, 'receive_enabled: true', `${relativePath} must not fake receive readiness`);
  assertNotIncludes(relativePath, "webhook_status: 'healthy'", `${relativePath} must not fake webhook health`);
});

const frontend = ['src/api/omnichannel.js', 'src/pages/OmnichannelSetup.jsx', 'src/components/tickets/AiDraftPanel.jsx']
  .map((relativePath) => read(relativePath))
  .join('\n');
[
  'POSTMARK_SERVER_TOKEN',
  'META_PAGE_ACCESS_TOKEN',
  'WHATSAPP_ACCESS_TOKEN',
  'META_APP_SECRET',
].forEach((secretName) => {
  const valueAccessPattern = new RegExp(`(?:process\\.env|import\\.meta\\.env|Deno\\.env)[^\\n]*${secretName}`);
  if (valueAccessPattern.test(frontend)) {
    fail(`Frontend must not read provider Secret value ${secretName}`);
  }
});

if (errors.length) {
  console.error('Module 1 preflight failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Module 1 preflight passed.');
