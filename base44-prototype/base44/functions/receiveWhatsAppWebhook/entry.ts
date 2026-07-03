import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createInboundConversation, env, json, readJsonWithRawBody, verifyMetaSignature } from '../../shared/omniShared.ts';

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge') || '';
    if (mode === 'subscribe' && token === env('WHATSAPP_VERIFY_TOKEN')) {
      return new Response(challenge, { status: 200 });
    }
    return json({ error: 'WhatsApp webhook verification failed' }, 403);
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const base44 = createClientFromRequest(req);
  const { rawBody, body: payload } = await readJsonWithRawBody(req);
  const signature = await verifyMetaSignature(req, rawBody);
  if (!signature.ok) return json({ error: signature.error }, 401);
  const results = [];

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const accountId = value.metadata?.phone_number_id || value.metadata?.display_phone_number || '';
      const contactsByWaId = new Map((value.contacts || []).map((c: any) => [c.wa_id, c]));
      for (const msg of value.messages || []) {
        const contact: any = contactsByWaId.get(msg.from) || {};
        const text = msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || `[${msg.type || 'non-text'} message]`;
        const result = await createInboundConversation(base44, {
          channel_type: 'whatsapp',
          external_account_id: accountId,
          external_thread_id: msg.from,
          external_message_id: msg.id || `${msg.from}-${msg.timestamp || Date.now()}`,
          external_customer_id: msg.from,
          sender_name: contact.profile?.name || msg.from,
          sender_contact: msg.from,
          subject: 'WhatsApp message',
          body_text: text,
          raw_payload: msg,
        });
        results.push({ ticket_id: result.ticket?.id, message_id: result.message.id, draft_id: result.draft?.id, duplicate: !!result.duplicate });
      }
    }
  }
  return json({ success: true, processed: results.length, results });
});
