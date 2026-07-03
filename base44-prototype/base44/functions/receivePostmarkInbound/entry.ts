import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createInboundConversation, env, json, readJson } from '../../shared/omniShared.ts';

function authorized(req: Request) {
  const expected = env('POSTMARK_INBOUND_WEBHOOK_SECRET');
  if (!expected) return false;
  const url = new URL(req.url);
  const provided = req.headers.get('x-lightsoff-webhook-secret') || url.searchParams.get('secret') || '';
  return provided === expected;
}

function headerValue(headers: any[] = [], name: string) {
  const match = headers.find((header) => String(header.Name || '').toLowerCase() === name.toLowerCase());
  return match?.Value || '';
}

function normalizeSubject(subject = '') {
  return String(subject || '').replace(/^\s*((re|fw|fwd):\s*)+/i, '').trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!authorized(req)) return json({ error: 'Unauthorized inbound email webhook' }, 401);
  const base44 = createClientFromRequest(req);
  const payload = await readJson(req);
  const from = payload.FromFull || {};
  const fromEmail = from.Email || payload.From || '';
  const inReplyTo = headerValue(payload.Headers || [], 'In-Reply-To');
  const references = headerValue(payload.Headers || [], 'References');
  const threadHint = inReplyTo || references || `${fromEmail}:${normalizeSubject(payload.Subject || '')}`;
  const result = await createInboundConversation(base44, {
    channel_type: 'email',
    external_account_id: payload.OriginalRecipient || payload.MailboxHash || '',
    external_thread_id: threadHint,
    external_message_id: payload.MessageID || payload.MessageId || '',
    external_customer_id: fromEmail,
    sender_name: from.Name || payload.FromName || payload.From || '',
    sender_contact: fromEmail,
    subject: payload.Subject || 'Email message',
    body_text: payload.TextBody || payload.StrippedTextReply || payload.HtmlBody || '',
    body_html: payload.HtmlBody || '',
    attachments: (payload.Attachments || []).map((a: any) => a.Name || a.ContentID || 'attachment'),
    raw_payload: payload,
  });
  return json({ success: true, ticket_id: result.ticket?.id, message_id: result.message.id, draft_id: result.draft?.id, duplicate: !!result.duplicate });
});
