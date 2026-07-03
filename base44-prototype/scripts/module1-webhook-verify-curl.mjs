const [, , provider, rawUrl] = process.argv;

function usage() {
  console.error('Usage: node scripts/module1-webhook-verify-curl.mjs <meta|whatsapp> <webhook-url>');
  console.error('Env: META_VERIFY_TOKEN for meta; WHATSAPP_VERIFY_TOKEN for whatsapp.');
  process.exit(1);
}

if (!provider || !rawUrl) usage();

let url;
try {
  url = new URL(rawUrl);
} catch {
  usage();
}

if (url.hostname === 'app.base44.com' || url.pathname.includes('/editor/preview')) {
  console.error('Do not use the Base44 editor preview URL for provider verification.');
  process.exit(1);
}
if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
  console.error('Do not use localhost or plain HTTP for provider verification.');
  process.exit(1);
}

let token = '';
if (provider === 'meta') {
  token = process.env.META_VERIFY_TOKEN || '';
  if (!token) {
    console.error('META_VERIFY_TOKEN is required for Meta webhook verification curl.');
    process.exit(1);
  }
} else if (provider === 'whatsapp') {
  token = process.env.WHATSAPP_VERIFY_TOKEN || '';
  if (!token) {
    console.error('WHATSAPP_VERIFY_TOKEN is required for WhatsApp webhook verification curl.');
    process.exit(1);
  }
} else {
  usage();
}

url.searchParams.set('hub.mode', 'subscribe');
url.searchParams.set('hub.verify_token', token);
url.searchParams.set('hub.challenge', 'module1-verify-ok');

console.log(`curl -i "${url.toString()}"`);
