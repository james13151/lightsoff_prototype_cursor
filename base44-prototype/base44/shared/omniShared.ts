export const API_VERSION = 'v20.0';

export const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email',
  facebook: 'Facebook Messenger',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
};

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export async function readJson(req: Request) {
  return await req.json().catch(() => ({}));
}

export async function readJsonWithRawBody(req: Request) {
  const rawBody = await req.text().catch(() => '');
  if (!rawBody) return { rawBody: '', body: {} };
  try {
    return { rawBody, body: JSON.parse(rawBody) };
  } catch {
    return { rawBody, body: {} };
  }
}

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function secureEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

export async function verifyMetaSignature(req: Request, rawBody: string, secretName = 'META_APP_SECRET') {
  const secret = env(secretName);
  if (!secret) return { ok: false, error: `Missing Secret: ${secretName}` };
  const provided = req.headers.get('x-hub-signature-256') || '';
  if (!provided.startsWith('sha256=')) return { ok: false, error: 'Missing x-hub-signature-256 header' };

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = `sha256=${toHex(digest)}`;
  return { ok: secureEqual(provided, expected), error: 'Invalid webhook signature' };
}

export async function requireUser(base44: any) {
  const user = await base44.auth.me().catch(() => null);
  if (!user) throw new Error('Unauthorized');
  return user;
}

export function requireRole(user: any, roles: string[]) {
  if (!roles.includes(user?.role)) {
    throw new Error('Forbidden');
  }
  return user;
}

export async function requireAdmin(base44: any) {
  return requireRole(await requireUser(base44), ['admin']);
}

export async function requireStaffOperator(base44: any) {
  return requireRole(await requireUser(base44), ['admin', 'staff']);
}

export function statusForError(error: unknown) {
  const message = String((error as any)?.message || error || '');
  if (message.includes('Unauthorized')) return 401;
  if (message.includes('Forbidden')) return 403;
  return 500;
}

export function env(name: string) {
  return Deno.env.get(name) || '';
}

export function missingEnv(names: string[]) {
  return names.filter((name) => !env(name));
}

export function buildPostmarkEmailRequest(input: Record<string, any>) {
  const subject = String(input.subject || 'Re: your message');
  const body = withoutUndefined({
    From: input.from,
    To: input.to,
    Subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
    TextBody: input.text,
    MessageStream: input.messageStream || undefined,
  });
  return {
    url: 'https://api.postmarkapp.com/email',
    init: {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': input.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    body,
  };
}

export function buildMetaMessageRequest(input: Record<string, any>) {
  const senderNode = input.senderNode || 'me';
  const body = {
    recipient: { id: input.recipient },
    messaging_type: 'RESPONSE',
    message: { text: input.text },
  };
  return {
    url: `https://graph.facebook.com/${input.apiVersion || API_VERSION}/${senderNode}/messages`,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    body,
  };
}

export function buildWhatsAppMessageRequest(input: Record<string, any>) {
  const templateName = input.templateName || '';
  const body = templateName
    ? {
        messaging_product: 'whatsapp',
        to: input.to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: input.languageCode || 'en_US' },
        },
      }
    : {
        messaging_product: 'whatsapp',
        to: input.to,
        type: 'text',
        text: { preview_url: false, body: input.text },
      };
  return {
    url: `https://graph.facebook.com/${input.apiVersion || API_VERSION}/${input.phoneNumberId}/messages`,
    init: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    body,
  };
}

export function stringifyDetails(value: unknown) {
  try {
    return JSON.stringify(value, null, 2).slice(0, 7000);
  } catch {
    return String(value).slice(0, 7000);
  }
}

export function truncate(value = '', max = 4800) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function detectIntent(text = '') {
  const haystack = text.toLowerCase();
  if (/(cancel|cancellation|取消)/.test(haystack)) return 'cancel_request';
  if (/(wrong item|incorrect|sent wrong|错发|发错)/.test(haystack)) return 'wrong_item';
  if (/(broken|damage|damaged|crack|破损|坏了)/.test(haystack)) return 'damaged_item';
  if (/(refund|return|退货|退款)/.test(haystack)) return 'return_refund';
  if (/(fit|fitment|compatible|lhd|rhd|适配|能装)/.test(haystack)) return 'fitment_question';
  if (/(ship|tracking|delivery|where is my order|物流|快递)/.test(haystack)) return 'shipping_question';
  if (/(collab|collaboration|creator|influencer|合作|达人)/.test(haystack)) return 'collaboration_request';
  if (/(distributor|dealer|wholesale|批发|代理|经销)/.test(haystack)) return 'distributor_request';
  if (/(how to order|place an order|where can i buy|怎么买|哪里买)/.test(haystack)) return 'faq_how_to_order';
  return 'unknown';
}

export function riskForIntent(intent: string, text = '') {
  const haystack = text.toLowerCase();
  if (/(chargeback|lawsuit|lawyer|legal|投诉|起诉)/.test(haystack)) return 'high';
  if (['cancel_request', 'wrong_item', 'damaged_item', 'return_refund'].includes(intent)) return 'high';
  if (['fitment_question', 'shipping_question', 'collaboration_request', 'distributor_request'].includes(intent)) return 'medium';
  if (intent.startsWith('faq_')) return 'low';
  return 'medium';
}

export function ticketTypeForIntent(intent: string) {
  if (['wrong_item', 'damaged_item'].includes(intent)) return '投诉';
  if (['return_refund', 'cancel_request'].includes(intent)) return '退货';
  if (intent === 'shipping_question') return '物流异常';
  return '咨询';
}

export function priorityForRisk(risk: string) {
  return risk === 'high' || risk === 'blocked' ? '紧急' : '普通';
}

function withoutUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));
}

export async function upsertChannelAccount(base44: any, channelType: string, patch: Record<string, unknown> = {}) {
  const existing = await base44.asServiceRole.entities.ChannelAccount.filter({ channel_type: channelType }, '-created_date', 1);
  const now = new Date().toISOString();
  const cleanPatch = withoutUndefined(patch);
  const payload = {
    channel_type: channelType,
    display_name: CHANNEL_LABELS[channelType] || channelType,
    ...cleanPatch,
  };
  if (existing?.[0]) {
    await base44.asServiceRole.entities.ChannelAccount.update(existing[0].id, payload);
    return { ...existing[0], ...payload };
  }
  return await base44.asServiceRole.entities.ChannelAccount.create({
    setup_status: 'not_configured',
    webhook_status: 'unknown',
    send_enabled: false,
    receive_enabled: false,
    last_test_at: now,
    ...payload,
  });
}

export function setupStatusForReadiness(account: Record<string, any>) {
  if (account.send_enabled && account.receive_enabled) return 'connected';
  if (account.send_enabled || account.receive_enabled) return 'degraded';
  return account.setup_status || 'not_configured';
}

export async function updateChannelReadiness(base44: any, channelType: string, patch: Record<string, unknown> = {}) {
  const existing = await base44.asServiceRole.entities.ChannelAccount.filter({ channel_type: channelType }, '-updated_date', 1);
  const current = existing?.[0] || {};
  const next = { ...current, ...patch };
  const computedStatus = setupStatusForReadiness(next);
  return await upsertChannelAccount(base44, channelType, {
    ...patch,
    setup_status: computedStatus === 'connected' ? 'connected' : patch.setup_status || computedStatus,
  });
}

export async function recordConnectorTest(
  base44: any,
  user: any,
  channelType: string,
  testType: string,
  status: string,
  message: string,
  details: unknown = null,
  channelAccountId = '',
  readinessPatch: Record<string, unknown> = {},
) {
  const run = await base44.asServiceRole.entities.ConnectorTestRun.create({
    channel_account_id: channelAccountId,
    channel_type: channelType,
    test_type: testType,
    status,
    message,
    details: details ? stringifyDetails(details) : '',
    tested_by_id: user?.id || '',
    tested_by_name: user?.full_name || 'System',
  });

  if (status === 'success') {
    const successPatch: Record<string, unknown> = {
      ...readinessPatch,
      last_test_at: new Date().toISOString(),
      last_error: '',
    };
    if (testType === 'webhook' || testType === 'inbound') {
      successPatch.receive_enabled = true;
      successPatch.webhook_status = 'healthy';
    }
    if (testType === 'outbound') successPatch.send_enabled = true;
    if (!('send_enabled' in successPatch) && !('receive_enabled' in successPatch)) {
      successPatch.setup_status = 'degraded';
    }
    await updateChannelReadiness(base44, channelType, successPatch);
  } else {
    const failurePatch: Record<string, unknown> = {
      setup_status: 'error',
      last_test_at: new Date().toISOString(),
      last_error: message,
      ...readinessPatch,
    };
    if (testType === 'webhook' || testType === 'inbound') {
      failurePatch.webhook_status = 'failing';
      failurePatch.receive_enabled = false;
    } else if (testType === 'outbound') {
      failurePatch.send_enabled = false;
    } else if (testType === 'secrets') {
      failurePatch.send_enabled = false;
      failurePatch.receive_enabled = false;
    }
    await updateChannelReadiness(base44, channelType, {
      ...failurePatch,
    });
  }
  return run;
}

export async function requireChannelSendReady(base44: any, channelType: string) {
  const accounts = await base44.asServiceRole.entities.ChannelAccount.filter({ channel_type: channelType }, '-updated_date', 1);
  const account = accounts?.[0];
  const ready = account?.setup_status === 'connected' && account?.send_enabled && account?.receive_enabled;
  if (!ready) {
    throw new Error(`Connector ${channelType} is not send-ready. Run Test connector in Omnichannel Setup.`);
  }
  return account;
}

export function assertTicketChannel(ticket: any, channelType: string) {
  if (ticket?.channel_type !== channelType) {
    throw new Error(`Ticket channel mismatch. Expected ${channelType}.`);
  }
  if (!ticket?.external_customer_id) {
    throw new Error(`Ticket is missing external customer id for ${channelType}.`);
  }
}

export async function loadLinkedDraft(base44: any, draftId: string, ticket: any, channelType: string) {
  if (!draftId) throw new Error('AI draft id required for beta send policy.');
  const drafts = await base44.asServiceRole.entities.AiDraft.filter({ id: draftId });
  const draft = drafts?.[0];
  if (!draft) throw new Error('AI draft not found');
  if (String(draft.ticket_id) !== String(ticket.id)) throw new Error('AI draft does not belong to this ticket');
  if (draft.channel_type !== channelType) throw new Error(`AI draft channel mismatch. Expected ${channelType}.`);
  if (draft.approval_state !== 'approved') {
    throw new Error(`AI draft must be approved before sending. Current state: ${draft.approval_state || 'unknown'}.`);
  }
  return draft;
}

export async function createInboundConversation(base44: any, input: Record<string, any>) {
  const now = new Date().toISOString();
  const channelType = input.channel_type;
  const channel = input.demo_mode
    ? await upsertChannelAccount(base44, channelType)
    : await updateChannelReadiness(base44, channelType, {
        receive_enabled: true,
        webhook_status: 'healthy',
        last_inbound_at: now,
        external_account_id: input.external_account_id || '',
        last_error: '',
      });

  const intent = detectIntent(`${input.subject || ''}\n${input.body_text || ''}`);
  const risk = riskForIntent(intent, input.body_text || '');
  const externalThreadId = input.external_thread_id || input.external_message_id || `${channelType}-${Date.now()}`;
  if (input.external_message_id) {
    const duplicateMessages = await base44.asServiceRole.entities.ConversationMessage.filter({
      channel_type: channelType,
      external_message_id: input.external_message_id,
    }, '-created_date', 1);
    if (duplicateMessages?.[0]) {
      const message = duplicateMessages[0];
      const tickets = await base44.asServiceRole.entities.Ticket.filter({ id: message.ticket_id }, '-created_date', 1);
      const drafts = await base44.asServiceRole.entities.AiDraft.filter({ conversation_message_id: String(message.id) }, '-created_date', 1);
      return { channel, ticket: tickets?.[0], message, draft: drafts?.[0], duplicate: true };
    }
  }

  const existingTickets = await base44.asServiceRole.entities.Ticket.filter({
    channel_type: channelType,
    external_thread_id: externalThreadId,
  }, '-created_date', 1);

  let ticket = existingTickets?.[0];
  const ticketPayload = {
    title: input.subject || `${CHANNEL_LABELS[channelType]} message from ${input.sender_name || input.sender_contact || 'customer'}`,
    ticket_type: ticketTypeForIntent(intent),
    customer_name: input.sender_name || '',
    customer_contact: input.sender_contact || input.external_customer_id || '',
    platform: CHANNEL_LABELS[channelType] || channelType,
    channel_type: channelType,
    external_thread_id: externalThreadId,
    external_customer_id: input.external_customer_id || '',
    status: '待处理',
    priority: priorityForRisk(risk),
    ai_intent: intent,
    ai_risk: risk,
    send_policy_state: channelType === 'whatsapp' ? 'service_window_open' : 'manual_approval_required',
    last_external_message_at: now,
    attachments: input.attachments || [],
  };

  if (ticket) {
    await base44.asServiceRole.entities.Ticket.update(ticket.id, {
      ...ticketPayload,
      title: ticket.title || ticketPayload.title,
      status: ticket.status === '已解决' ? '待处理' : ticket.status,
    });
    ticket = { ...ticket, ...ticketPayload };
  } else {
    ticket = await base44.asServiceRole.entities.Ticket.create(ticketPayload);
  }

  const message = await base44.asServiceRole.entities.ConversationMessage.create({
    ticket_id: String(ticket.id),
    channel_account_id: channel.id,
    channel_type: channelType,
    external_thread_id: externalThreadId,
    external_message_id: input.external_message_id || '',
    external_customer_id: input.external_customer_id || '',
    direction: 'inbound',
    sender_name: input.sender_name || '',
    sender_contact: input.sender_contact || '',
    subject: input.subject || '',
    body_text: truncate(input.body_text || ''),
    body_html: truncate(input.body_html || ''),
    attachments: input.attachments || [],
    language: input.language || '',
    delivery_status: 'received',
    raw_payload: truncate(stringifyDetails(input.raw_payload || {})),
  });

  await base44.asServiceRole.entities.TimelineEntry.create({
    ticket_id: String(ticket.id),
    author_name: input.sender_name || CHANNEL_LABELS[channelType] || 'Customer',
    content: truncate(input.body_text || input.subject || 'Inbound channel message', 1800),
    entry_type: 'channel_message',
    is_system: true,
  });

  const draft = await createAiDraft(base44, ticket, message);
  return { channel, ticket, message, draft };
}

export async function createAiDraft(base44: any, ticket: any, message: any) {
  const prompt = [
    'You are lights:off Module 1, an AI-first ecommerce operator inbox.',
    'Summarize the inbound customer message, classify intent and risk, and draft a concise reply.',
    'Never promise refunds, discounts, cancellation, replacement, shipping dates, or fitment certainty unless explicitly present.',
    'Draft in the customer language when obvious. Keep tone warm but firm.',
    '',
    `Ticket: ${ticket.title || ''}`,
    `Channel: ${message.channel_type || ticket.channel_type || ''}`,
    `Customer: ${message.sender_name || ticket.customer_name || ''}`,
    `Message: ${message.body_text || ''}`,
  ].join('\n');

  const schema = {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      intent: { type: 'string' },
      risk_level: { type: 'string', enum: ['low', 'medium', 'high', 'blocked'] },
      recommended_action: { type: 'string' },
      draft_text: { type: 'string' },
      missing_info: { type: 'array', items: { type: 'string' } },
    },
    required: ['summary', 'intent', 'risk_level', 'recommended_action', 'draft_text'],
  };

  let ai: any = null;
  try {
    ai = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: schema,
    });
  } catch {
    const intent = detectIntent(message.body_text || ticket.title || '');
    const risk = riskForIntent(intent, message.body_text || '');
    ai = {
      summary: truncate(message.body_text || ticket.title || 'New channel message', 240),
      intent,
      risk_level: risk,
      recommended_action: risk === 'high' ? 'Review manually before replying.' : 'Approve or edit the draft reply.',
      draft_text: 'Thanks for reaching out. I am checking this now and will get back to you shortly.',
      missing_info: [],
    };
  }

  const draft = await base44.asServiceRole.entities.AiDraft.create({
    ticket_id: String(ticket.id),
    conversation_message_id: String(message.id),
    channel_type: message.channel_type || ticket.channel_type,
    summary: ai.summary || '',
    intent: ai.intent || 'unknown',
    risk_level: ai.risk_level || 'medium',
    recommended_action: ai.recommended_action || '',
    draft_text: ai.draft_text || '',
    missing_info: ai.missing_info || [],
    approval_state: ai.risk_level === 'blocked' ? 'blocked' : 'draft',
    send_policy_state: ticket.send_policy_state || 'manual_approval_required',
    model_name: 'Base44 InvokeLLM',
    prompt_version: 'module1-v0.1',
  });

  await base44.asServiceRole.entities.Ticket.update(ticket.id, {
    ai_summary: ai.summary || '',
    ai_intent: ai.intent || 'unknown',
    ai_risk: ai.risk_level || 'medium',
  });

  await base44.asServiceRole.entities.TimelineEntry.create({
    ticket_id: String(ticket.id),
    author_name: 'lights:off AI',
    content: truncate(`Draft prepared (${ai.risk_level || 'medium'}): ${ai.draft_text || ''}`, 1800),
    entry_type: 'ai_draft',
    is_system: true,
  });

  return draft;
}

export function whatsappWindowOpen(ticket: any) {
  if (!ticket?.last_external_message_at) return false;
  const last = new Date(ticket.last_external_message_at).getTime();
  return Number.isFinite(last) && Date.now() - last < 24 * 60 * 60 * 1000;
}

export async function recordSendAttempt(base44: any, ticket: any, channelType: string, payload: Record<string, any>) {
  const status = payload.send_status || 'failed';
  const label = status === 'sent' ? 'sent' : status === 'blocked' ? 'blocked' : 'failed';
  const reason = payload.reason ? ` Reason: ${payload.reason}` : '';
  const body = payload.body_text ? `\n\n${payload.body_text}` : '';
  return await base44.asServiceRole.entities.TimelineEntry.create({
    ticket_id: String(ticket.id),
    author_id: payload.author_id || '',
    author_name: payload.sender_name || 'lights:off',
    content: truncate(`${CHANNEL_LABELS[channelType] || channelType} send ${label}.${reason}${body}`, 1800),
    entry_type: 'send_attempt',
    is_system: true,
    send_status: status,
    provider: channelType,
  });
}

export async function markOutbound(base44: any, ticket: any, channelType: string, payload: Record<string, any>) {
  const now = new Date().toISOString();
  const channel = await updateChannelReadiness(base44, channelType, {
    send_enabled: true,
    last_outbound_at: now,
    last_error: '',
  });
  const message = await base44.asServiceRole.entities.ConversationMessage.create({
    ticket_id: String(ticket.id),
    channel_account_id: channel.id,
    channel_type: channelType,
    external_thread_id: ticket.external_thread_id || payload.external_thread_id || '',
    external_message_id: payload.external_message_id || '',
    external_customer_id: ticket.external_customer_id || payload.external_customer_id || '',
    direction: 'outbound',
    sender_name: payload.sender_name || 'lights:off',
    sender_contact: payload.sender_contact || '',
    subject: payload.subject || '',
    body_text: truncate(payload.body_text || ''),
    delivery_status: payload.delivery_status || 'sent',
    raw_payload: truncate(stringifyDetails(payload.raw_payload || {})),
  });
  await recordSendAttempt(base44, ticket, channelType, {
    ...payload,
    send_status: 'sent',
  });
  return message;
}
