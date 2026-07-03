import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createAiDraft, json, readJson, requireStaffOperator, statusForError } from '../../shared/omniShared.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const base44 = createClientFromRequest(req);
  try {
    await requireStaffOperator(base44);
    const body = await readJson(req);
    if (!body.ticket_id) return json({ success: false, error: 'ticket_id required' }, 400);
    const tickets = await base44.asServiceRole.entities.Ticket.filter({ id: body.ticket_id });
    const ticket = tickets?.[0];
    if (!ticket) return json({ success: false, error: 'Ticket not found' }, 404);
    const messages = await base44.asServiceRole.entities.ConversationMessage.filter({ ticket_id: String(ticket.id) }, '-created_date', 1);
    const message = messages?.[0] || {
      id: '',
      ticket_id: ticket.id,
      channel_type: ticket.channel_type || 'email',
      body_text: ticket.title,
      sender_name: ticket.customer_name,
    };
    const draft = await createAiDraft(base44, ticket, message);
    return json({ success: true, draft });
  } catch (error) {
    return json({ success: false, error: String(error?.message || error) }, statusForError(error));
  }
});
