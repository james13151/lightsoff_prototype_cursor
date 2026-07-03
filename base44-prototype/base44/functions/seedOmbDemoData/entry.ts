import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { createInboundConversation, json, requireAdmin, statusForError } from '../../shared/omniShared.ts';

const SCENARIOS = [
  {
    channel_type: 'email',
    sender_name: 'Customer - Cancellation',
    sender_contact: 'customer@example.com',
    subject: 'Cancel my order before it ships',
    body_text: 'Hi, I need to cancel my order before it ships. Can you confirm if it has already been picked?',
  },
  {
    channel_type: 'facebook',
    sender_name: 'Facebook customer',
    sender_contact: 'fb_customer_001',
    subject: 'Wrong item sent',
    body_text: 'I received the wrong SKU. This does not fit my car. What should I do?',
  },
  {
    channel_type: 'instagram',
    sender_name: 'Creator lead',
    sender_contact: 'ig_creator_omb',
    subject: 'Collaboration request',
    body_text: 'I run a Volvo page and want to collaborate on the V60 diffuser. Can you send details?',
  },
  {
    channel_type: 'whatsapp',
    sender_name: 'WhatsApp customer',
    sender_contact: '15551234567',
    subject: 'Broken item received',
    body_text: 'The item arrived broken. I can send photos. Please help.',
  },
];

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const base44 = createClientFromRequest(req);
  try {
    const user = await requireAdmin(base44);
    const results = [];
    for (const scenario of SCENARIOS) {
      const result = await createInboundConversation(base44, {
        ...scenario,
        external_account_id: 'omb-demo',
        external_thread_id: `omb-demo-${scenario.channel_type}-${Date.now()}-${results.length}`,
        external_message_id: `omb-demo-msg-${Date.now()}-${results.length}`,
        external_customer_id: scenario.sender_contact,
        demo_mode: true,
        raw_payload: { source: 'OMB demo seed', seeded_by: user.full_name },
      });
      results.push({ ticket_id: result.ticket.id, message_id: result.message.id, draft_id: result.draft.id });
    }
    return json({ success: true, created: results.length, results });
  } catch (error) {
    return json({ success: false, error: String(error?.message || error) }, statusForError(error));
  }
});
