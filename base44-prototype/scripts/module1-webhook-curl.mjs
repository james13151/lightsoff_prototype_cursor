import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [, , provider, rawUrl, fixturePath] = process.argv;

function usage() {
  console.error('Usage: node scripts/module1-webhook-curl.mjs <postmark|meta|whatsapp> <webhook-url> <fixture-json>');
  console.error('Env: POSTMARK_INBOUND_WEBHOOK_SECRET for postmark; META_APP_SECRET for meta/whatsapp.');
  process.exit(1);
}

if (!provider || !rawUrl || !fixturePath) usage();

const payload = fs.readFileSync(path.resolve(fixturePath), 'utf8');
const compactPayload = JSON.stringify(JSON.parse(payload));
let url = rawUrl;
const headers = ['-H "Content-Type: application/json"'];

if (provider === 'postmark') {
  const secret = process.env.POSTMARK_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('POSTMARK_INBOUND_WEBHOOK_SECRET is required for postmark fixture curl.');
    process.exit(1);
  }
  const separator = url.includes('?') ? '&' : '?';
  url = `${url}${separator}secret=${encodeURIComponent(secret)}`;
} else if (provider === 'meta' || provider === 'whatsapp') {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    console.error('META_APP_SECRET is required for meta/whatsapp fixture curl.');
    process.exit(1);
  }
  const signature = crypto.createHmac('sha256', secret).update(compactPayload).digest('hex');
  headers.push(`-H "x-hub-signature-256: sha256=${signature}"`);
} else {
  usage();
}

const escapedPayload = compactPayload.replaceAll("'", "'\\''");
console.log(`curl -i -X POST "${url}" ${headers.join(' ')} --data '${escapedPayload}'`);
