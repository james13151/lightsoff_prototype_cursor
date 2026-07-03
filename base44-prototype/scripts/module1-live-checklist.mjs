import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checklist = JSON.parse(fs.readFileSync(path.join(root, 'docs/MODULE_1_LIVE_TEST_CHECKLIST.json'), 'utf8'));
const rawBaseUrl = process.argv[2] || '';

function usage() {
  console.error('Usage: npm run module1:live-checklist -- <published-base44-function-base>');
  console.error('Example: npm run module1:live-checklist -- https://your-app.base44.app');
  process.exit(1);
}

function parseBase(raw) {
  if (!raw) usage();
  let url;
  try {
    url = new URL(raw);
  } catch {
    usage();
  }
  if (url.hostname === 'app.base44.com' || url.pathname.includes('/editor/preview')) {
    console.error('Do not use the Base44 editor preview URL. Use the published/default HTTPS function base.');
    process.exit(1);
  }
  if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    console.error('Do not use localhost or plain HTTP for provider callbacks. Use the published/default HTTPS function base.');
    process.exit(1);
  }
  url.pathname = url.pathname.replace(/\/$/, '');
  url.search = '';
  url.hash = '';
  return url;
}

const baseUrl = parseBase(rawBaseUrl);

function functionUrl(channel) {
  const url = new URL(baseUrl.toString());
  url.pathname = `${url.pathname.replace(/\/$/, '')}/functions/${channel.webhook_function}`;
  url.search = channel.webhook_query || '';
  return url.toString();
}

function curlCommand(channel) {
  const fixture = channel.fixture;
  if (!fixture) return '';
  const envPrefix = `${fixture.env}=...`;
  return `${envPrefix} npm run module1:webhook-curl -- ${fixture.provider} '${functionUrl(channel)}' ${fixture.path}`;
}

function verifyCurlCommand(channel) {
  const verify = channel.verify;
  if (!verify) return '';
  return `${verify.env}=... npm run module1:webhook-verify-curl -- ${verify.provider} '${functionUrl(channel)}'`;
}

function section(title) {
  console.log('');
  console.log(`## ${title}`);
}

console.log(`# Module 1 Live Connector Checklist`);
console.log('');
console.log(`App id: ${checklist.app_id}`);
console.log(`Function base: ${baseUrl.toString().replace(/\/$/, '')}`);
console.log('');
console.log('Principles:');
for (const item of checklist.principles) console.log(`- ${item}`);

section('Global Gates');
for (const gate of checklist.global_gates) {
  console.log(`- [ ] ${gate.label}`);
  if (gate.command) console.log(`      Command: ${gate.command}`);
  console.log(`      Evidence: ${gate.evidence}`);
}

section('Provider Callback URLs');
for (const channel of checklist.channels) {
  console.log(`- ${channel.label}: ${functionUrl(channel)}`);
}

section('Channel Tests');
for (const channel of checklist.channels) {
  console.log('');
  console.log(`### ${channel.label}`);
  console.log(`Required Secrets: ${channel.required_secrets.join(', ')}`);
  if (channel.optional_secrets?.length) console.log(`Optional Secrets: ${channel.optional_secrets.join(', ')}`);
  console.log(`Webhook URL: ${functionUrl(channel)}`);
  const verifyCurl = verifyCurlCommand(channel);
  if (verifyCurl) {
    console.log(`Verification curl template: ${verifyCurl}`);
  }
  console.log('');
  console.log('Provider setup:');
  for (const item of channel.provider_setup) console.log(`- [ ] ${item}`);
  console.log('Connector test:');
  for (const item of channel.connector_test) console.log(`- [ ] ${item}`);
  console.log('Inbound test:');
  for (const item of channel.inbound_test) console.log(`- [ ] ${item}`);
  console.log('Outbound test:');
  for (const item of channel.outbound_test) console.log(`- [ ] ${item}`);
  console.log('Fixture curl template:');
  console.log(`    ${curlCommand(channel)}`);
}

section('Negative Tests');
for (const test of checklist.negative_tests) {
  console.log(`- [ ] ${test.label}`);
  if (test.fixture) {
    const channel = checklist.channels.find((item) => item.type === test.fixture.channel_type);
    const url = channel ? functionUrl(channel) : '<callback-url>';
    console.log(`      Fixture: ${test.fixture.env}=... npm run module1:webhook-curl -- ${test.fixture.provider} '${url}' ${test.fixture.path}`);
  }
  console.log(`      Expected: ${test.expected}`);
}
