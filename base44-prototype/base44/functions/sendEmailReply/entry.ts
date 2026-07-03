import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { assertTicketChannel, buildPostmarkEmailRequest, env, json, loadLinkedDraft, markOutbound, missingEnv, readJson, recordSendAttempt, requireChannelSendReady, requireStaffOperator, statusForError } from '../../shared/omniShared.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const base44 = createClientFromRequest(req);
  try {
    const user = await requireStaffOperator(base44);
    const body = await readJson(req);
    if (!body.ticket_id) return json({ success: false, error: 'ticket_id required' }, 400);

    const tickets = await base44.asServiceRole.entities.Ticket.filter({ id: body.ticket_id });
    const ticket = tickets?.[0];
    if (!ticket) return json({ success: false, error: 'Ticket not found' }, 404);
    assertTicketChannel(ticket, 'email');
    const draft = await loadLinkedDraft(base44, body.ai_draft_id, ticket, 'email');

    const latestInbound = await base44.asServiceRole.entities.ConversationMessage.filter({
      ticket_id: String(ticket.id),
      channel_type: 'email',
      direction: 'inbound',
    }, '-created_date', 1);
    const to = body.to || latestInbound?.[0]?.sender_contact || ticket.customer_contact;
    const subject = body.subject || latestInbound?.[0]?.subject || ticket.title || 'Re: your message';
    const text = body.body_text || draft?.edited_text || draft?.draft_text;

    const failAttempt = async (sendStatus: string, reason: string, status = 400, provider: unknown = null) => {
      await recordSendAttempt(base44, ticket, 'email', {
        author_id: user.id,
        sender_name: user.full_name,
        body_text: text || '',
        send_status: sendStatus,
        reason,
        raw_payload: provider,
      });
      return json({ success: false, error: reason, provider }, status);
    };

    const missing = missingEnv(['POSTMARK_SERVER_TOKEN', 'POSTMARK_FROM_EMAIL']);
    if (missing.length) return await failAttempt('failed', `Missing Secrets: ${missing.join(', ')}`);
    try {
      await requireChannelSendReady(base44, 'email');
    } catch (error) {
      return await failAttempt('blocked', String(error?.message || error), 409);
    }
    if (!to || !text) return await failAttempt('failed', 'Recipient and reply text required');

    const request = buildPostmarkEmailRequest({
      token: env('POSTMARK_SERVER_TOKEN'),
      from: env('POSTMARK_FROM_EMAIL'),
      to,
      subject,
      text,
      messageStream: env('POSTMARK_MESSAGE_STREAM') || '',
    });
    const res = await fetch(request.url, request.init);
    const provider = await res.json().catch(() => ({}));
    if (!res.ok) return await failAttempt('failed', provider?.Message || `Postmark failed: ${res.status}`, 502, provider);

    const message = await markOutbound(base44, ticket, 'email', {
      sender_name: user.full_name,
      sender_contact: env('POSTMARK_FROM_EMAIL'),
      subject,
      body_text: text,
      external_message_id: provider.MessageID || '',
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
