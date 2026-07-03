import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];

function fail(message) {
  errors.push(message);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function expectIncludes(actual, expected, label) {
  if (!String(actual || '').includes(expected)) fail(`${label}: expected to include ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function headerValue(headers = [], name) {
  const match = headers.find((header) => String(header.Name || '').toLowerCase() === name.toLowerCase());
  return match?.Value || '';
}

function normalizeSubject(subject = '') {
  return String(subject || '').replace(/^\s*((re|fw|fwd):\s*)+/i, '').trim().toLowerCase();
}

function parsePostmark(payload) {
  const from = payload.FromFull || {};
  const fromEmail = from.Email || payload.From || '';
  const inReplyTo = headerValue(payload.Headers || [], 'In-Reply-To');
  const references = headerValue(payload.Headers || [], 'References');
  return {
    channel_type: 'email',
    external_thread_id: inReplyTo || references || `${fromEmail}:${normalizeSubject(payload.Subject || '')}`,
    external_message_id: payload.MessageID || payload.MessageId || '',
    external_customer_id: fromEmail,
    body_text: payload.TextBody || payload.StrippedTextReply || payload.HtmlBody || '',
  };
}

function parseMeta(payload, forcedChannel) {
  const results = [];
  let ignored = 0;
  const channelType = forcedChannel || (payload.object === 'instagram' ? 'instagram' : 'facebook');
  for (const entry of payload.entry || []) {
    for (const event of entry.messaging || []) {
      const inboundMessage = event.message && !event.message.is_echo ? event.message : null;
      const postback = event.postback || null;
      const senderId = event.sender?.id || '';
      const recipientId = event.recipient?.id || entry.id || '';
      if (!senderId || (!inboundMessage && !postback)) {
        ignored += 1;
        continue;
      }
      const attachments = (inboundMessage?.attachments || []).map((attachment) => {
        const type = attachment.type || 'attachment';
        const url = attachment.payload?.url || attachment.payload?.sticker_id || '';
        return url ? `${type}:${url}` : type;
      });
      results.push({
        channel_type: channelType,
        external_thread_id: senderId,
        external_message_id: inboundMessage?.mid || `${entry.id || channelType}-${event.timestamp || Date.now()}`,
        external_customer_id: senderId,
        body_text: inboundMessage?.text || postback?.title || (attachments.length ? `[${attachments.join(', ')}]` : '[non-text message]'),
        attachments,
        external_account_id: recipientId,
      });
    }
  }
  return { ignored, results };
}

function parseWhatsApp(payload) {
  const results = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const accountId = value.metadata?.phone_number_id || value.metadata?.display_phone_number || '';
      const contactsByWaId = new Map((value.contacts || []).map((contact) => [contact.wa_id, contact]));
      for (const msg of value.messages || []) {
        const contact = contactsByWaId.get(msg.from) || {};
        results.push({
          channel_type: 'whatsapp',
          external_account_id: accountId,
          external_thread_id: msg.from,
          external_message_id: msg.id || `${msg.from}-${msg.timestamp || Date.now()}`,
          external_customer_id: msg.from,
          sender_name: contact.profile?.name || msg.from,
          body_text: msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || `[${msg.type || 'non-text'} message]`,
        });
      }
    }
  }
  return results;
}

const postmark = parsePostmark(readJson('fixtures/module1/postmark-inbound.json'));
expectEqual(postmark.channel_type, 'email', 'Postmark channel');
expectEqual(postmark.external_message_id, 'demo-postmark-message-001', 'Postmark message id');
expectEqual(postmark.external_customer_id, 'customer@example.com', 'Postmark customer id');
expectIncludes(postmark.external_thread_id, 'cancel my order before it ships', 'Postmark thread hint');
expectIncludes(postmark.body_text, 'cancel my order', 'Postmark text body');

const facebook = parseMeta(readJson('fixtures/module1/meta-facebook-message.json'), 'facebook');
expectEqual(facebook.results.length, 1, 'Facebook processed count');
expectEqual(facebook.ignored, 0, 'Facebook ignored count');
expectEqual(facebook.results[0]?.channel_type, 'facebook', 'Facebook channel');
expectEqual(facebook.results[0]?.external_message_id, 'demo-facebook-message-001', 'Facebook message id');
expectIncludes(facebook.results[0]?.body_text, 'wrong SKU', 'Facebook body text');

const instagram = parseMeta(readJson('fixtures/module1/meta-instagram-message.json'), 'instagram');
expectEqual(instagram.results.length, 1, 'Instagram processed count');
expectEqual(instagram.results[0]?.channel_type, 'instagram', 'Instagram channel');
expectEqual(instagram.results[0]?.external_message_id, 'demo-instagram-message-001', 'Instagram message id');
expectIncludes(instagram.results[0]?.body_text, 'collab', 'Instagram body text');

const ignored = parseMeta(readJson('fixtures/module1/meta-facebook-ignored-events.json'), 'facebook');
expectEqual(ignored.results.length, 0, 'Meta ignored-events processed count');
expectEqual(ignored.ignored, 3, 'Meta ignored-events ignored count');

const whatsapp = parseWhatsApp(readJson('fixtures/module1/whatsapp-message.json'));
expectEqual(whatsapp.length, 1, 'WhatsApp processed count');
expectEqual(whatsapp[0]?.channel_type, 'whatsapp', 'WhatsApp channel');
expectEqual(whatsapp[0]?.external_message_id, 'demo-whatsapp-message-001', 'WhatsApp message id');
expectEqual(whatsapp[0]?.external_customer_id, '15551234567', 'WhatsApp customer id');
expectIncludes(whatsapp[0]?.body_text, 'arrived broken', 'WhatsApp body text');

if (errors.length) {
  console.error('Module 1 fixture parser check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Module 1 fixture parser check passed.');
