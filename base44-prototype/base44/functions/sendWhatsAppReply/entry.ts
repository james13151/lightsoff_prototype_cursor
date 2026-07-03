import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { API_VERSION, assertTicketChannel, buildWhatsAppMessageRequest, env, json, loadLinkedDraft, markOutbound, readJson, recordSendAttempt, requireChannelSendReady, requireStaffOperator, statusForError, whatsappWindowOpen } from '../../shared/omniShared.ts';

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
    assertTicketChannel(ticket, 'whatsapp');
    const draft = await loadLinkedDraft(base44, body.ai_draft_id, ticket, 'whatsapp');

    const to = body.to || ticket.external_customer_id;
    const text = body.body_text || draft?.edited_text || draft?.draft_text;
    const templateName = body.template_name || '';
    const languageCode = body.language_code || 'en_US';

    const failAttempt = async (sendStatus: string, reason: string, status = 400, provider: unknown = null) => {
      await recordSendAttempt(base44, ticket, 'whatsapp', {
        author_id: user.id,
        sender_name: user.full_name,
        body_text: templateName ? `[WhatsApp template requested: ${templateName}]` : text || '',
        send_status: sendStatus,
        reason,
        raw_payload: provider,
      });
      return json({ success: false, error: reason, provider }, status);
    };

    if (!env('WHATSAPP_ACCESS_TOKEN') || !env('WHATSAPP_PHONE_NUMBER_ID')) {
      return await failAttempt('failed', 'Missing Secrets: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID');
    }
    try {
      await requireChannelSendReady(base44, 'whatsapp');
    } catch (error) {
      return await failAttempt('blocked', String(error?.message || error), 409);
    }
    if (!to) return await failAttempt('failed', 'WhatsApp recipient required');
    if (!templateName && !text) return await failAttempt('failed', 'Reply text required for free-form WhatsApp message');

    const insideWindow = whatsappWindowOpen(ticket);
    if (!insideWindow && !templateName) {
      await base44.asServiceRole.entities.Ticket.update(ticket.id, {
        send_policy_state: 'blocked_whatsapp_template_required',
      });
      await recordSendAttempt(base44, ticket, 'whatsapp', {
        author_id: user.id,
        sender_name: user.full_name,
        body_text: text || '',
        send_status: 'blocked',
        reason: 'WhatsApp free-form window is closed. Select an approved template before sending.',
      });
      return json({
        success: false,
        blocked: true,
        error: 'WhatsApp free-form window is closed. Select an approved template before sending.',
      }, 403);
    }

    const request = buildWhatsAppMessageRequest({
      apiVersion: API_VERSION,
      accessToken: env('WHATSAPP_ACCESS_TOKEN'),
      phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'),
      to,
      text,
      templateName,
      languageCode,
    });
    const res = await fetch(request.url, request.init);
    const provider = await res.json().catch(() => ({}));
    if (!res.ok) return await failAttempt('failed', provider?.error?.message || `WhatsApp send failed: ${res.status}`, 502, provider);

    const sentText = templateName ? `[WhatsApp template sent: ${templateName}]` : text;
    const message = await markOutbound(base44, ticket, 'whatsapp', {
      sender_name: user.full_name,
      body_text: sentText,
      external_message_id: provider.messages?.[0]?.id || '',
      raw_payload: provider,
    });
    await base44.asServiceRole.entities.Ticket.update(ticket.id, {
      send_policy_state: insideWindow ? 'sent_inside_service_window' : 'sent_template',
    });
    if (draft) {
      await base44.asServiceRole.entities.AiDraft.update(draft.id, {
        approval_state: 'sent',
        edited_text: body.body_text || draft.edited_text || '',
        approved_by_id: user.id,
        approved_by_name: user.full_name,
        approved_at: new Date().toISOString(),
        send_policy_state: insideWindow ? 'sent_inside_service_window' : 'sent_template',
      });
    }
    return json({ success: true, message_id: message.id, provider });
  } catch (error) {
    return json({ success: false, error: String(error?.message || error) }, statusForError(error));
  }
});
