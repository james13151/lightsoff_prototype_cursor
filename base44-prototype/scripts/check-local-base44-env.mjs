import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envPath = path.join(root, '.env.local');
const expectedAppId = '6a1fcff6f516dd811c7315c7';

function parseEnv(source) {
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    values[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return values;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(envPath)) {
  fail([
    '.env.local is missing.',
    'Copy .env.example to .env.local, keep provider API keys out of it, and set VITE_BASE44_APP_BASE_URL to the published/default HTTPS Base44 function base.',
  ].join('\n'));
}

const values = parseEnv(fs.readFileSync(envPath, 'utf8'));
const configuredAppId = values.VITE_BASE44_APP_ID;
const base = values.VITE_BASE44_APP_BASE_URL;

if (configuredAppId !== expectedAppId) {
  fail(`VITE_BASE44_APP_ID must be ${expectedAppId}; got ${configuredAppId || '(empty)'}.`);
}

if (!base || base.includes('your-base44-function-base')) {
  fail('VITE_BASE44_APP_BASE_URL is still empty or placeholder. Set it to the published/default HTTPS Base44 function base.');
}

let url;
try {
  url = new URL(base);
} catch {
  fail('VITE_BASE44_APP_BASE_URL is not a valid URL.');
}

if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
  fail('VITE_BASE44_APP_BASE_URL must be the published/default HTTPS Base44 function base, not localhost.');
}

if (url.hostname === 'app.base44.com' || url.pathname.includes('/editor/preview')) {
  fail('VITE_BASE44_APP_BASE_URL must not be the Base44 editor preview URL.');
}

console.log('Local Base44 env looks ready.');
