// Generated from base44/functions/receivePostmarkInbound/entry.ts. Do not edit directly.


// base44/functions/receivePostmarkInbound/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

// base44/shared/omniShared.ts
var CHANNEL_LABELS = {
  email: "Email",
  facebook: "Facebook Messenger",
  instagram: "Instagram",
  whatsapp: "WhatsApp"
};
function json(data, status = 200) {
  return Response.json(data, { status });
}
async function readJson(req) {
  return await req.json().catch(() => ({}));
}
function env(name) {
  return Deno.env.get(name) || "";
}
function stringifyDetails(value) {
  try {
    return JSON.stringify(value, null, 2).slice(0, 7e3);
  } catch {
    return String(value).slice(0, 7e3);
  }
}
function truncate(value = "", max = 4800) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...` : text;
}
function detectIntent(text = "") {
  const haystack = text.toLowerCase();
  if (/(cancel|cancellation|取消)/.test(haystack)) return "cancel_request";
  if (/(wrong item|incorrect|sent wrong|错发|发错)/.test(haystack)) return "wrong_item";
  if (/(broken|damage|damaged|crack|破损|坏了)/.test(haystack)) return "damaged_item";
  if (/(refund|return|退货|退款)/.test(haystack)) return "return_refund";
  if (/(fit|fitment|compatible|lhd|rhd|适配|能装)/.test(haystack)) return "fitment_question";
  if (/(ship|tracking|delivery|where is my order|物流|快递)/.test(haystack)) return "shipping_question";
  if (/(collab|collaboration|creator|influencer|合作|达人)/.test(haystack)) return "collaboration_request";
  if (/(distributor|dealer|wholesale|批发|代理|经销)/.test(haystack)) return "distributor_request";
  if (/(how to order|place an order|where can i buy|怎么买|哪里买)/.test(haystack)) return "faq_how_to_order";
  return "unknown";
}
function riskForIntent(intent, text = "") {
  const haystack = text.toLowerCase();
  if (/(chargeback|lawsuit|lawyer|legal|投诉|起诉)/.test(haystack)) return "high";
  if (["cancel_request", "wrong_item", "damaged_item", "return_refund"].includes(intent)) return "high";
  if (["fitment_question", "shipping_question", "collaboration_request", "distributor_request"].includes(intent)) return "medium";
  if (intent.startsWith("faq_")) return "low";
  return "medium";
}
function ticketTypeForIntent(intent) {
  if (["wrong_item", "damaged_item"].includes(intent)) return "\u6295\u8BC9";
  if (["return_refund", "cancel_request"].includes(intent)) return "\u9000\u8D27";
  if (intent === "shipping_question") return "\u7269\u6D41\u5F02\u5E38";
  return "\u54A8\u8BE2";
}
function priorityForRisk(risk) {
  return risk === "high" || risk === "blocked" ? "\u7D27\u6025" : "\u666E\u901A";
}
function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== void 0));
}
async function upsertChannelAccount(base44, channelType, patch = {}) {
  const existing = await base44.asServiceRole.entities.ChannelAccount.filter({ channel_type: channelType }, "-created_date", 1);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const cleanPatch = withoutUndefined(patch);
  const payload = {
    channel_type: channelType,
    display_name: CHANNEL_LABELS[channelType] || channelType,
    ...cleanPatch
  };
  if (existing?.[0]) {
    await base44.asServiceRole.entities.ChannelAccount.update(existing[0].id, payload);
    return { ...existing[0], ...payload };
  }
  return await base44.asServiceRole.entities.ChannelAccount.create({
    setup_status: "not_configured",
    webhook_status: "unknown",
    send_enabled: false,
    receive_enabled: false,
    last_test_at: now,
    ...payload
  });
}
function setupStatusForReadiness(account) {
  if (account.send_enabled && account.receive_enabled) return "connected";
  if (account.send_enabled || account.receive_enabled) return "degraded";
  return account.setup_status || "not_configured";
}
async function updateChannelReadiness(base44, channelType, patch = {}) {
  const existing = await base44.asServiceRole.entities.ChannelAccount.filter({ channel_type: channelType }, "-updated_date", 1);
  const current = existing?.[0] || {};
  const next = { ...current, ...patch };
  const computedStatus = setupStatusForReadiness(next);
  return await upsertChannelAccount(base44, channelType, {
    ...patch,
    setup_status: computedStatus === "connected" ? "connected" : patch.setup_status || computedStatus
  });
}
async function createInboundConversation(base44, input) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const channelType = input.channel_type;
  const channel = input.demo_mode ? await upsertChannelAccount(base44, channelType) : await updateChannelReadiness(base44, channelType, {
    receive_enabled: true,
    webhook_status: "healthy",
    last_inbound_at: now,
    external_account_id: input.external_account_id || "",
    last_error: ""
  });
  const intent = detectIntent(`${input.subject || ""}
${input.body_text || ""}`);
  const risk = riskForIntent(intent, input.body_text || "");
  const externalThreadId = input.external_thread_id || input.external_message_id || `${channelType}-${Date.now()}`;
  if (input.external_message_id) {
    const duplicateMessages = await base44.asServiceRole.entities.ConversationMessage.filter({
      channel_type: channelType,
      external_message_id: input.external_message_id
    }, "-created_date", 1);
    if (duplicateMessages?.[0]) {
      const message2 = duplicateMessages[0];
      const tickets = await base44.asServiceRole.entities.Ticket.filter({ id: message2.ticket_id }, "-created_date", 1);
      const drafts = await base44.asServiceRole.entities.AiDraft.filter({ conversation_message_id: String(message2.id) }, "-created_date", 1);
      return { channel, ticket: tickets?.[0], message: message2, draft: drafts?.[0], duplicate: true };
    }
  }
  const existingTickets = await base44.asServiceRole.entities.Ticket.filter({
    channel_type: channelType,
    external_thread_id: externalThreadId
  }, "-created_date", 1);
  let ticket = existingTickets?.[0];
  const ticketPayload = {
    title: input.subject || `${CHANNEL_LABELS[channelType]} message from ${input.sender_name || input.sender_contact || "customer"}`,
    ticket_type: ticketTypeForIntent(intent),
    customer_name: input.sender_name || "",
    customer_contact: input.sender_contact || input.external_customer_id || "",
    platform: CHANNEL_LABELS[channelType] || channelType,
    channel_type: channelType,
    external_thread_id: externalThreadId,
    external_customer_id: input.external_customer_id || "",
    status: "\u5F85\u5904\u7406",
    priority: priorityForRisk(risk),
    ai_intent: intent,
    ai_risk: risk,
    send_policy_state: channelType === "whatsapp" ? "service_window_open" : "manual_approval_required",
    last_external_message_at: now,
    attachments: input.attachments || []
  };
  if (ticket) {
    await base44.asServiceRole.entities.Ticket.update(ticket.id, {
      ...ticketPayload,
      title: ticket.title || ticketPayload.title,
      status: ticket.status === "\u5DF2\u89E3\u51B3" ? "\u5F85\u5904\u7406" : ticket.status
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
    external_message_id: input.external_message_id || "",
    external_customer_id: input.external_customer_id || "",
    direction: "inbound",
    sender_name: input.sender_name || "",
    sender_contact: input.sender_contact || "",
    subject: input.subject || "",
    body_text: truncate(input.body_text || ""),
    body_html: truncate(input.body_html || ""),
    attachments: input.attachments || [],
    language: input.language || "",
    delivery_status: "received",
    raw_payload: truncate(stringifyDetails(input.raw_payload || {}))
  });
  await base44.asServiceRole.entities.TimelineEntry.create({
    ticket_id: String(ticket.id),
    author_name: input.sender_name || CHANNEL_LABELS[channelType] || "Customer",
    content: truncate(input.body_text || input.subject || "Inbound channel message", 1800),
    entry_type: "channel_message",
    is_system: true
  });
  const draft = await createAiDraft(base44, ticket, message);
  return { channel, ticket, message, draft };
}
async function createAiDraft(base44, ticket, message) {
  const prompt = [
    "You are lights:off Module 1, an AI-first ecommerce operator inbox.",
    "Summarize the inbound customer message, classify intent and risk, and draft a concise reply.",
    "Never promise refunds, discounts, cancellation, replacement, shipping dates, or fitment certainty unless explicitly present.",
    "Draft in the customer language when obvious. Keep tone warm but firm.",
    "",
    `Ticket: ${ticket.title || ""}`,
    `Channel: ${message.channel_type || ticket.channel_type || ""}`,
    `Customer: ${message.sender_name || ticket.customer_name || ""}`,
    `Message: ${message.body_text || ""}`
  ].join("\n");
  const schema = {
    type: "object",
    properties: {
      summary: { type: "string" },
      intent: { type: "string" },
      risk_level: { type: "string", enum: ["low", "medium", "high", "blocked"] },
      recommended_action: { type: "string" },
      draft_text: { type: "string" },
      missing_info: { type: "array", items: { type: "string" } }
    },
    required: ["summary", "intent", "risk_level", "recommended_action", "draft_text"]
  };
  let ai = null;
  try {
    ai = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: schema
    });
  } catch {
    const intent = detectIntent(message.body_text || ticket.title || "");
    const risk = riskForIntent(intent, message.body_text || "");
    ai = {
      summary: truncate(message.body_text || ticket.title || "New channel message", 240),
      intent,
      risk_level: risk,
      recommended_action: risk === "high" ? "Review manually before replying." : "Approve or edit the draft reply.",
      draft_text: "Thanks for reaching out. I am checking this now and will get back to you shortly.",
      missing_info: []
    };
  }
  const draft = await base44.asServiceRole.entities.AiDraft.create({
    ticket_id: String(ticket.id),
    conversation_message_id: String(message.id),
    channel_type: message.channel_type || ticket.channel_type,
    summary: ai.summary || "",
    intent: ai.intent || "unknown",
    risk_level: ai.risk_level || "medium",
    recommended_action: ai.recommended_action || "",
    draft_text: ai.draft_text || "",
    missing_info: ai.missing_info || [],
    approval_state: ai.risk_level === "blocked" ? "blocked" : "draft",
    send_policy_state: ticket.send_policy_state || "manual_approval_required",
    model_name: "Base44 InvokeLLM",
    prompt_version: "module1-v0.1"
  });
  await base44.asServiceRole.entities.Ticket.update(ticket.id, {
    ai_summary: ai.summary || "",
    ai_intent: ai.intent || "unknown",
    ai_risk: ai.risk_level || "medium"
  });
  await base44.asServiceRole.entities.TimelineEntry.create({
    ticket_id: String(ticket.id),
    author_name: "lights:off AI",
    content: truncate(`Draft prepared (${ai.risk_level || "medium"}): ${ai.draft_text || ""}`, 1800),
    entry_type: "ai_draft",
    is_system: true
  });
  return draft;
}

// base44/functions/receivePostmarkInbound/entry.ts
function authorized(req) {
  const expected = env("POSTMARK_INBOUND_WEBHOOK_SECRET");
  if (!expected) return false;
  const url = new URL(req.url);
  const provided = req.headers.get("x-lightsoff-webhook-secret") || url.searchParams.get("secret") || "";
  return provided === expected;
}
function headerValue(headers = [], name) {
  const match = headers.find((header) => String(header.Name || "").toLowerCase() === name.toLowerCase());
  return match?.Value || "";
}
function normalizeSubject(subject = "") {
  return String(subject || "").replace(/^\s*((re|fw|fwd):\s*)+/i, "").trim().toLowerCase();
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!authorized(req)) return json({ error: "Unauthorized inbound email webhook" }, 401);
  const base44 = createClientFromRequest(req);
  const payload = await readJson(req);
  const from = payload.FromFull || {};
  const fromEmail = from.Email || payload.From || "";
  const inReplyTo = headerValue(payload.Headers || [], "In-Reply-To");
  const references = headerValue(payload.Headers || [], "References");
  const threadHint = inReplyTo || references || `${fromEmail}:${normalizeSubject(payload.Subject || "")}`;
  const result = await createInboundConversation(base44, {
    channel_type: "email",
    external_account_id: payload.OriginalRecipient || payload.MailboxHash || "",
    external_thread_id: threadHint,
    external_message_id: payload.MessageID || payload.MessageId || "",
    external_customer_id: fromEmail,
    sender_name: from.Name || payload.FromName || payload.From || "",
    sender_contact: fromEmail,
    subject: payload.Subject || "Email message",
    body_text: payload.TextBody || payload.StrippedTextReply || payload.HtmlBody || "",
    body_html: payload.HtmlBody || "",
    attachments: (payload.Attachments || []).map((a) => a.Name || a.ContentID || "attachment"),
    raw_payload: payload
  });
  return json({ success: true, ticket_id: result.ticket?.id, message_id: result.message.id, draft_id: result.draft?.id, duplicate: !!result.duplicate });
});
