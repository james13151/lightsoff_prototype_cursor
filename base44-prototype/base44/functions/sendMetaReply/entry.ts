import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { API_VERSION, assertTicketChannel, buildMetaMessageRequest, env, json, loadLinkedDraft, markOutbound, readJson, recordSendAttempt, requireChannelSendReady, requireStaffOperator, statusForError } from '../../shared/omniShared.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const base44 = createClientFromRequest(req);
  try {
    const user = await requireStaffOperator(base44);
    const body = await readJson(req);
    const channelType = body.channel_type || 'facebook';
    if (!['facebook', 'instagram'].includes(channelType)) return json({ success: false, error: 'channel_type must be facebook or instagram' }, 400);
    if (!body.ticket_id) return json({ success: false, error: 'ticket_id required' }, 400);
    const tickets = await base44.asServiceRole.entities.Ticket.filter({ id: body.ticket_id });
    const ticket = tickets?.[0];
    if (!ticket) return json({ success: false, error: 'Ticket not found' }, 404);
    assertTicketChannel(ticket, channelType);
    const draft = await loadLinkedDraft(base44, body.ai_draft_id, ticket, channelType);
    const text = body.body_text || draft?.edited_text || draft?.draft_text;
    const recipient = body.to || ticket.external_customer_id;

    const failAttempt = async (sendStatus: string, reason: string, status = 400, provider: unknown = null) => {
      await recordSendAttempt(base44, ticket, channelType, {
        author_id: user.id,
        sender_name: user.full_name,
        body_text: text || '',
        send_status: sendStatus,
        reason,
        raw_payload: provider,
      });
      return json({ success: false, error: reason, provider }, status);
    };

    if (!env('META_PAGE_ACCESS_TOKEN')) return await failAttempt('failed', 'Missing Secret: META_PAGE_ACCESS_TOKEN');
    try {
      await requireChannelSendReady(base44, channelType);
    } catch (error) {
      return await failAttempt('blocked', String(error?.message || error), 409);
    }
    if (!recipient || !text) return await failAttempt('failed', 'Recipient and reply text required');

    const senderNode = channelType === 'instagram' ? env('META_INSTAGRAM_ACCOUNT_ID') : 'me';
    if (!senderNode) return await failAttempt('failed', 'Missing Secret: META_INSTAGRAM_ACCOUNT_ID');

    const request = buildMetaMessageRequest({
      apiVersion: API_VERSION,
      accessToken: env('META_PAGE_ACCESS_TOKEN'),
      senderNode,
      recipient,
      text,
    });
    const res = await fetch(request.url, request.init);
    const provider = await res.json().catch(() => ({}));
    if (!res.ok) return await failAttempt('failed', provider?.error?.message || `Meta send failed: ${res.status}`, 502, provider);

    const message = await markOutbound(base44, ticket, channelType, {
      sender_name: user.full_name,
      body_text: text,
      external_message_id: provider.message_id || provider.recipient_id || '',
      raw_payload: provider,
    });
    if (draft) {
      await base44.asServiceRole.entities.AiDraft.update(draft.id, {
        approval_state: 'sent',
        edited_text: body.body_text || draft.edited_text || '',
        approved_by_id: user.id,
        approved_by_name: user.full_name,
        approved_at: new Date().toISOString(),
      });
    }
    return json({ success: true, message_id: message.id, provider });
  } catch (error) {
    return json({ success: false, error: String(error?.message || error) }, statusForError(error));
  }
});
