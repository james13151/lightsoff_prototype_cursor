import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

const root = process.cwd();
const errors = [];

function fail(message) {
  errors.push(message);
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function expectTrue(value, label) {
  if (!value) fail(`${label}: expected truthy value`);
}

function expectThrows(fn, expectedText, label) {
  try {
    fn();
    fail(`${label}: expected throw including ${JSON.stringify(expectedText)}`);
  } catch (error) {
    if (!String(error?.message || error).includes(expectedText)) {
      fail(`${label}: wrong error ${String(error?.message || error)}`);
    }
  }
}

async function expectRejects(fn, expectedText, label) {
  try {
    await fn();
    fail(`${label}: expected rejection including ${JSON.stringify(expectedText)}`);
  } catch (error) {
    if (!String(error?.message || error).includes(expectedText)) {
      fail(`${label}: wrong error ${String(error?.message || error)}`);
    }
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function signature(secret, rawBody) {
  return `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

function createStore(prefix) {
  let nextId = 1;
  const rows = [];
  return {
    rows,
    async create(payload) {
      const now = new Date().toISOString();
      const row = {
        id: `${prefix}_${nextId++}`,
        created_date: now,
        updated_date: now,
        ...clone(payload),
      };
      rows.push(row);
      return clone(row);
    },
    async update(id, patch) {
      const row = rows.find((item) => String(item.id) === String(id));
      if (!row) throw new Error(`${prefix} row not found: ${id}`);
      Object.assign(row, clone(patch), { updated_date: new Date().toISOString() });
      return clone(row);
    },
    async filter(query = {}, sort = '', limit = undefined) {
      let matches = rows.filter((row) => Object.entries(query).every(([key, value]) => String(row[key]) === String(value)));
      if (sort) {
        const desc = sort.startsWith('-');
        const field = desc ? sort.slice(1) : sort;
        matches = [...matches].sort((left, right) => {
          const a = left[field] || '';
          const b = right[field] || '';
          if (a === b) return 0;
          return (a > b ? 1 : -1) * (desc ? -1 : 1);
        });
      }
      return clone(typeof limit === 'number' ? matches.slice(0, limit) : matches);
    },
  };
}

function createFakeBase44({ llmResult = null } = {}) {
  const stores = {
    ChannelAccount: createStore('channel'),
    ConnectorTestRun: createStore('run'),
    ConversationMessage: createStore('message'),
    Ticket: createStore('ticket'),
    AiDraft: createStore('draft'),
    TimelineEntry: createStore('timeline'),
  };
  const entities = Object.fromEntries(Object.entries(stores).map(([name, store]) => [name, {
    create: store.create,
    update: store.update,
    filter: store.filter,
  }]));

  return {
    stores,
    client: {
      asServiceRole: { entities },
      integrations: {
        Core: {
          InvokeLLM: async () => {
            if (llmResult) return llmResult;
            throw new Error('No LLM configured in dry run');
          },
        },
      },
    },
  };
}

async function loadSharedModule() {
  globalThis.Deno = globalThis.Deno || { env: { get: () => '' } };
  const source = fs.readFileSync(path.join(root, 'base44/shared/omniShared.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
    fileName: 'omniShared.ts',
  });
  return await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(outputText)}`);
}

const shared = await loadSharedModule();

{
  const secrets = { META_APP_SECRET: 'meta-app-secret' };
  globalThis.Deno.env.get = (name) => secrets[name] || '';
  const rawBody = JSON.stringify({ object: 'page', entry: [] });
  const signedRequest = new Request('https://example.com/functions/receiveMetaWebhook', {
    method: 'POST',
    headers: { 'x-hub-signature-256': signature(secrets.META_APP_SECRET, rawBody) },
  });
  const valid = await shared.verifyMetaSignature(signedRequest, rawBody);
  expectEqual(valid.ok, true, 'valid Meta HMAC signature passes');

  const invalidRequest = new Request('https://example.com/functions/receiveMetaWebhook', {
    method: 'POST',
    headers: { 'x-hub-signature-256': 'sha256=bad' },
  });
  const invalid = await shared.verifyMetaSignature(invalidRequest, rawBody);
  expectEqual(invalid.ok, false, 'invalid Meta HMAC signature fails');
  expectEqual(invalid.error, 'Invalid webhook signature', 'invalid Meta HMAC error text');

  const missingHeader = await shared.verifyMetaSignature(new Request('https://example.com/functions/receiveMetaWebhook'), rawBody);
  expectEqual(missingHeader.ok, false, 'missing Meta HMAC header fails');
  expectEqual(missingHeader.error, 'Missing x-hub-signature-256 header', 'missing Meta HMAC header error text');

  globalThis.Deno.env.get = () => '';
  const missingSecret = await shared.verifyMetaSignature(signedRequest, rawBody);
  expectEqual(missingSecret.ok, false, 'missing Meta app secret fails');
  expectEqual(missingSecret.error, 'Missing Secret: META_APP_SECRET', 'missing Meta app secret error text');
}

{
  const request = shared.buildPostmarkEmailRequest({
    token: 'postmark-token',
    from: 'support@example.com',
    to: 'customer@example.com',
    subject: 'Order question',
    text: 'Hello from lights:off',
    messageStream: 'outbound',
  });
  expectEqual(request.url, 'https://api.postmarkapp.com/email', 'Postmark send URL');
  expectEqual(request.init.method, 'POST', 'Postmark send method');
  expectEqual(request.init.headers['X-Postmark-Server-Token'], 'postmark-token', 'Postmark token header');
  expectEqual(request.body.Subject, 'Re: Order question', 'Postmark reply subject prefix');
  expectEqual(request.body.MessageStream, 'outbound', 'Postmark message stream');
}

{
  const request = shared.buildMetaMessageRequest({
    apiVersion: 'v20.0',
    accessToken: 'meta-token',
    senderNode: '17890000000000000',
    recipient: 'customer_psid',
    text: 'Meta reply',
  });
  expectEqual(request.url, 'https://graph.facebook.com/v20.0/17890000000000000/messages', 'Meta send URL');
  expectEqual(request.init.headers.Authorization, 'Bearer meta-token', 'Meta authorization header');
  expectEqual(request.body.messaging_type, 'RESPONSE', 'Meta response messaging type');
  expectEqual(request.body.recipient.id, 'customer_psid', 'Meta recipient id');
  expectEqual(request.body.message.text, 'Meta reply', 'Meta text body');
}

{
  const textRequest = shared.buildWhatsAppMessageRequest({
    apiVersion: 'v20.0',
    accessToken: 'whatsapp-token',
    phoneNumberId: 'phone_123',
    to: '15551234567',
    text: 'WhatsApp reply',
  });
  expectEqual(textRequest.url, 'https://graph.facebook.com/v20.0/phone_123/messages', 'WhatsApp send URL');
  expectEqual(textRequest.init.headers.Authorization, 'Bearer whatsapp-token', 'WhatsApp authorization header');
  expectEqual(textRequest.body.messaging_product, 'whatsapp', 'WhatsApp messaging product');
  expectEqual(textRequest.body.type, 'text', 'WhatsApp text message type');
  expectEqual(textRequest.body.text.body, 'WhatsApp reply', 'WhatsApp text body');

  const templateRequest = shared.buildWhatsAppMessageRequest({
    apiVersion: 'v20.0',
    accessToken: 'whatsapp-token',
    phoneNumberId: 'phone_123',
    to: '15551234567',
    templateName: 'customer_service_followup',
    languageCode: 'en_US',
  });
  expectEqual(templateRequest.body.type, 'template', 'WhatsApp template message type');
  expectEqual(templateRequest.body.template.name, 'customer_service_followup', 'WhatsApp template name');
  expectEqual(templateRequest.body.template.language.code, 'en_US', 'WhatsApp template language');
}

expectEqual(shared.detectIntent('The item arrived broken and cracked'), 'damaged_item', 'damaged intent');
expectEqual(shared.riskForIntent('damaged_item'), 'high', 'damaged risk');
expectEqual(shared.priorityForRisk('high'), '紧急', 'high risk priority');
expectEqual(shared.ticketTypeForIntent('shipping_question'), '物流异常', 'shipping ticket type');
expectEqual(shared.setupStatusForReadiness({ send_enabled: false, receive_enabled: false }), 'not_configured', 'empty readiness status');
expectEqual(shared.setupStatusForReadiness({ send_enabled: true, receive_enabled: false }), 'degraded', 'send-only readiness status');
expectEqual(shared.setupStatusForReadiness({ send_enabled: true, receive_enabled: true }), 'connected', 'full readiness status');
expectTrue(shared.whatsappWindowOpen({ last_external_message_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() }), 'WhatsApp recent inbound opens window');
expectEqual(shared.whatsappWindowOpen({ last_external_message_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() }), false, 'WhatsApp old inbound closes window');

expectThrows(() => shared.assertTicketChannel({ channel_type: 'email', external_customer_id: 'x' }, 'whatsapp'), 'Ticket channel mismatch', 'ticket channel mismatch');
expectThrows(() => shared.assertTicketChannel({ channel_type: 'email' }, 'email'), 'external customer id', 'missing external customer id');

{
  const { client, stores } = createFakeBase44();
  const ticket = await stores.Ticket.create({ channel_type: 'email', external_customer_id: 'customer@example.com' });
  const draft = await stores.AiDraft.create({
    ticket_id: String(ticket.id),
    channel_type: 'email',
    approval_state: 'approved',
  });
  await expectRejects(() => shared.loadLinkedDraft(client, '', ticket, 'email'), 'AI draft id required', 'draft id required');
  await expectRejects(() => shared.loadLinkedDraft(client, draft.id, { ...ticket, id: 'other' }, 'email'), 'does not belong', 'draft ticket mismatch');
  await expectRejects(() => shared.loadLinkedDraft(client, draft.id, ticket, 'whatsapp'), 'channel mismatch', 'draft channel mismatch');
  await stores.AiDraft.update(draft.id, { approval_state: 'draft' });
  await expectRejects(() => shared.loadLinkedDraft(client, draft.id, ticket, 'email'), 'must be approved', 'draft must be approved');
  await stores.AiDraft.update(draft.id, { approval_state: 'approved' });
  const loaded = await shared.loadLinkedDraft(client, draft.id, ticket, 'email');
  expectEqual(loaded.id, draft.id, 'approved draft loads');
}

{
  const { client, stores } = createFakeBase44();
  const user = { id: 'admin_1', full_name: 'Admin' };
  await shared.recordConnectorTest(client, user, 'email', 'outbound', 'success', 'Outbound OK', null, '', { send_enabled: true });
  let accounts = await stores.ChannelAccount.filter({ channel_type: 'email' });
  expectEqual(accounts[0]?.send_enabled, true, 'outbound success sets send readiness');
  expectEqual(accounts[0]?.receive_enabled, false, 'outbound success does not fake receive readiness');
  expectEqual(accounts[0]?.setup_status, 'degraded', 'send-only connector is degraded');

  await shared.recordConnectorTest(client, user, 'email', 'inbound', 'success', 'Inbound OK');
  accounts = await stores.ChannelAccount.filter({ channel_type: 'email' });
  expectEqual(accounts[0]?.receive_enabled, true, 'inbound success sets receive readiness');
  expectEqual(accounts[0]?.webhook_status, 'healthy', 'inbound success sets webhook healthy');
  expectEqual(accounts[0]?.setup_status, 'connected', 'send plus receive is connected');

  await shared.recordConnectorTest(client, user, 'email', 'outbound', 'failed', 'Provider rejected send');
  accounts = await stores.ChannelAccount.filter({ channel_type: 'email' });
  expectEqual(accounts[0]?.send_enabled, false, 'outbound failure clears send readiness');
  expectEqual(accounts[0]?.receive_enabled, true, 'outbound failure preserves receive readiness');

  await shared.recordConnectorTest(client, user, 'email', 'secrets', 'failed', 'Missing Secrets');
  accounts = await stores.ChannelAccount.filter({ channel_type: 'email' });
  expectEqual(accounts[0]?.send_enabled, false, 'secrets failure clears send readiness');
  expectEqual(accounts[0]?.receive_enabled, false, 'secrets failure clears receive readiness');
}

{
  const { client, stores } = createFakeBase44();
  const ticket = await stores.Ticket.create({
    channel_type: 'email',
    external_thread_id: 'thread_1',
    external_customer_id: 'customer@example.com',
  });
  await shared.recordSendAttempt(client, ticket, 'email', {
    sender_name: 'Operator',
    send_status: 'blocked',
    reason: 'Connector is not ready',
    body_text: 'Draft reply',
  });
  expectEqual(stores.TimelineEntry.rows[0]?.entry_type, 'send_attempt', 'blocked send attempt timeline type');
  expectEqual(stores.TimelineEntry.rows[0]?.send_status, 'blocked', 'blocked send attempt timeline status');
  expectTrue(stores.TimelineEntry.rows[0]?.content.includes('Connector is not ready'), 'blocked send attempt records reason');

  await shared.markOutbound(client, ticket, 'email', {
    sender_name: 'Operator',
    body_text: 'Sent reply',
    external_message_id: 'provider_message_1',
  });
  expectEqual(stores.ConversationMessage.rows[0]?.direction, 'outbound', 'markOutbound creates outbound message');
  expectEqual(stores.TimelineEntry.rows[1]?.send_status, 'sent', 'markOutbound records sent timeline status');
}

{
  const { client, stores } = createFakeBase44();
  const input = {
    channel_type: 'facebook',
    external_account_id: 'page_123',
    external_thread_id: 'customer_123',
    external_message_id: 'message_123',
    external_customer_id: 'customer_123',
    sender_name: 'Facebook Customer',
    sender_contact: 'customer_123',
    subject: 'Wrong item sent',
    body_text: 'I received the wrong SKU and it does not fit my car.',
    raw_payload: { fixture: true },
  };

  const first = await shared.createInboundConversation(client, input);
  expectEqual(first.duplicate, undefined, 'first inbound is not duplicate');
  expectEqual(first.ticket.channel_type, 'facebook', 'inbound creates channel ticket');
  expectEqual(first.ticket.ai_intent, 'wrong_item', 'inbound detects intent');
  expectEqual(first.ticket.ai_risk, 'high', 'inbound assigns risk');
  expectEqual(first.message.external_message_id, 'message_123', 'inbound creates normalized message');
  expectEqual(first.draft.approval_state, 'draft', 'inbound creates draft-only AI reply');
  expectEqual(stores.Ticket.rows.length, 1, 'one ticket after first inbound');
  expectEqual(stores.ConversationMessage.rows.length, 1, 'one message after first inbound');
  expectEqual(stores.AiDraft.rows.length, 1, 'one draft after first inbound');
  expectEqual(stores.TimelineEntry.rows.length, 2, 'channel message and AI draft timeline entries');

  const duplicate = await shared.createInboundConversation(client, input);
  expectEqual(duplicate.duplicate, true, 'duplicate inbound is detected');
  expectEqual(stores.Ticket.rows.length, 1, 'duplicate does not create second ticket');
  expectEqual(stores.ConversationMessage.rows.length, 1, 'duplicate does not create second message');
  expectEqual(stores.AiDraft.rows.length, 1, 'duplicate does not create second draft');
}

if (errors.length) {
  console.error('Module 1 flow check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Module 1 flow check passed.');
