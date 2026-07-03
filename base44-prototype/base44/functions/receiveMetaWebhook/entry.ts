import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createInboundConversation, env, json, readJsonWithRawBody, verifyMetaSignature } from '../../shared/omniShared.ts';

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge') || '';
    if (mode === 'subscribe' && token === env('META_VERIFY_TOKEN')) {
      return new Response(challenge, { status: 200 });
    }
    return json({ error: 'Meta webhook verification failed' }, 403);
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const base44 = createClientFromRequest(req);
  const { rawBody, body: payload } = await readJsonWithRawBody(req);
  const signature = await verifyMetaSignature(req, rawBody);
  if (!signature.ok) return json({ error: signature.error }, 401);
  const url = new URL(req.url);
  const forcedChannel = url.searchParams.get('channel');
  if (forcedChannel && !['facebook', 'instagram'].includes(forcedChannel)) {
    return json({ error: 'channel must be facebook or instagram' }, 400);
  }
  const channelType = forcedChannel || (payload.object === 'instagram' ? 'instagram' : 'facebook');
  const results = [];
  let ignored = 0;

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

      const attachments = (inboundMessage?.attachments || []).map((attachment: any) => {
        const type = attachment.type || 'attachment';
        const url = attachment.payload?.url || attachment.payload?.sticker_id || '';
        return url ? `${type}:${url}` : type;
      });
      const text = inboundMessage?.text || postback?.title || (attachments.length ? `[${attachments.join(', ')}]` : '[non-text message]');
      const externalMessageId = inboundMessage?.mid || `${entry.id || channelType}-${event.timestamp || Date.now()}`;
      const result = await createInboundConversation(base44, {
        channel_type: channelType,
        external_account_id: recipientId,
        external_thread_id: senderId,
        external_message_id: externalMessageId,
        external_customer_id: senderId,
        sender_name: senderId,
        sender_contact: senderId,
        subject: `${channelType === 'instagram' ? 'Instagram' : 'Facebook'} message`,
        body_text: text,
        attachments,
        raw_payload: event,
      });
      results.push({ ticket_id: result.ticket?.id, message_id: result.message.id, draft_id: result.draft?.id, duplicate: !!result.duplicate });
    }
  }
  return json({ success: true, processed: results.length, ignored, results });
});
