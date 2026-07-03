const [, , rawBaseUrl] = process.argv;

function usage() {
  console.error('Usage: node scripts/module1-webhook-urls.mjs <base44-app-url>');
  console.error('Example: npm run module1:webhook-urls -- https://your-app.base44.app');
  console.error('Use the published/default Base44 app link, not the app.base44.com editor preview URL.');
  process.exit(1);
}

if (!rawBaseUrl) usage();

let baseUrl;
try {
  baseUrl = new URL(rawBaseUrl);
} catch {
  usage();
}

if (baseUrl.hostname === 'app.base44.com' || baseUrl.pathname.includes('/editor/preview')) {
  console.error('Do not pass the Base44 editor preview URL.');
  console.error('Use the published/default app link, for example https://your-app.base44.app.');
  process.exit(1);
}
if (['localhost', '127.0.0.1', '::1'].includes(baseUrl.hostname) || baseUrl.protocol !== 'https:') {
  console.error('Do not pass a local or non-HTTPS URL for provider callbacks.');
  console.error('Use the published/default HTTPS Base44 function base.');
  process.exit(1);
}

baseUrl.pathname = baseUrl.pathname.replace(/\/$/, '');
baseUrl.search = '';
baseUrl.hash = '';

function functionUrl(name, query = '') {
  const url = new URL(baseUrl.toString());
  url.pathname = `${url.pathname.replace(/\/$/, '')}/functions/${name}`;
  url.search = query;
  return url.toString();
}

const rows = [
  ['Email / Postmark inbound', functionUrl('receivePostmarkInbound'), 'Append ?secret=<POSTMARK_INBOUND_WEBHOOK_SECRET> in Postmark.'],
  ['Facebook Messenger', functionUrl('receiveMetaWebhook', 'channel=facebook'), 'Use META_VERIFY_TOKEN for GET verification.'],
  ['Instagram Messaging', functionUrl('receiveMetaWebhook', 'channel=instagram'), 'Use META_VERIFY_TOKEN for GET verification.'],
  ['WhatsApp Cloud API', functionUrl('receiveWhatsAppWebhook'), 'Use WHATSAPP_VERIFY_TOKEN for GET verification.'],
];

console.log('Module 1 provider callback URLs');
console.log('');
for (const [label, url, note] of rows) {
  console.log(`${label}:`);
  console.log(`  ${url}`);
  console.log(`  ${note}`);
  console.log('');
}
console.log('Important: paste the receive* URLs above into provider dashboards. Do not use verifyMetaWebhook or verifyWhatsAppWebhook as provider callbacks; receive* handles both GET verification and POST delivery.');
