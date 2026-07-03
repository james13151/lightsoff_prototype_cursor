// Generated from base44/functions/sendWhatsAppReply/entry.ts. Do not edit directly.


// base44/functions/sendWhatsAppReply/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

// base44/shared/omniShared.ts
var API_VERSION = "v20.0";
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
async function requireUser(base44) {
  const user = await base44.auth.me().catch(() => null);
  if (!user) throw new Error("Unauthorized");
  return user;
}
function requireRole(user, roles) {
  if (!roles.includes(user?.role)) {
    throw new Error("Forbidden");
  }
  return user;
}
async function requireStaffOperator(base44) {
  return requireRole(await requireUser(base44), ["admin", "staff"]);
}
function statusForError(error) {
  const message = String(error?.message || error || "");
  if (message.includes("Unauthorized")) return 401;
  if (message.includes("Forbidden")) return 403;
  return 500;
}
function env(name) {
  return Deno.env.get(name) || "";
}
function buildWhatsAppMessageRequest(input) {
  const templateName = input.templateName || "";
  const body = templateName ? {
    messaging_product: "whatsapp",
    to: input.to,
    type: "template",
    template: {
      name: templateName,
      language: { code: input.languageCode || "en_US" }
    }
  } : {
    messaging_product: "whatsapp",
    to: input.to,
    type: "text",
    text: { preview_url: false, body: input.text }
  };
  return {
    url: `https://graph.facebook.com/${input.apiVersion || API_VERSION}/${input.phoneNumberId}/messages`,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    },
    body
  };
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
async function requireChannelSendReady(base44, channelType) {
  const accounts = await base44.asServiceRole.entities.ChannelAccount.filter({ channel_type: channelType }, "-updated_date", 1);
  const account = accounts?.[0];
  const ready = account?.setup_status === "connected" && account?.send_enabled && account?.receive_enabled;
  if (!ready) {
    throw new Error(`Connector ${channelType} is not send-ready. Run Test connector in Omnichannel Setup.`);
  }
  return account;
}
function assertTicketChannel(ticket, channelType) {
  if (ticket?.channel_type !== channelType) {
    throw new Error(`Ticket channel mismatch. Expected ${channelType}.`);
  }
  if (!ticket?.external_customer_id) {
    throw new Error(`Ticket is missing external customer id for ${channelType}.`);
  }
}
async function loadLinkedDraft(base44, draftId, ticket, channelType) {
  if (!draftId) throw new Error("AI draft id required for beta send policy.");
  const drafts = await base44.asServiceRole.entities.AiDraft.filter({ id: draftId });
  const draft = drafts?.[0];
  if (!draft) throw new Error("AI draft not found");
  if (String(draft.ticket_id) !== String(ticket.id)) throw new Error("AI draft does not belong to this ticket");
  if (draft.channel_type !== channelType) throw new Error(`AI draft channel mismatch. Expected ${channelType}.`);
  if (draft.approval_state !== "approved") {
    throw new Error(`AI draft must be approved before sending. Current state: ${draft.approval_state || "unknown"}.`);
  }
  return draft;
}
function whatsappWindowOpen(ticket) {
  if (!ticket?.last_external_message_at) return false;
  const last = new Date(ticket.last_external_message_at).getTime();
  return Number.isFinite(last) && Date.now() - last < 24 * 60 * 60 * 1e3;
}
async function recordSendAttempt(base44, ticket, channelType, payload) {
  const status = payload.send_status || "failed";
  const label = status === "sent" ? "sent" : status === "blocked" ? "blocked" : "failed";
  const reason = payload.reason ? ` Reason: ${payload.reason}` : "";
  const body = payload.body_text ? `

${payload.body_text}` : "";
  return await base44.asServiceRole.entities.TimelineEntry.create({
    ticket_id: String(ticket.id),
    author_id: payload.author_id || "",
    author_name: payload.sender_name || "lights:off",
    content: truncate(`${CHANNEL_LABELS[channelType] || channelType} send ${label}.${reason}${body}`, 1800),
    entry_type: "send_attempt",
    is_system: true,
    send_status: status,
    provider: channelType
  });
}
async function markOutbound(base44, ticket, channelType, payload) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const channel = await updateChannelReadiness(base44, channelType, {
    send_enabled: true,
    last_outbound_at: now,
    last_error: ""
  });
  const message = await base44.asServiceRole.entities.ConversationMessage.create({
    ticket_id: String(ticket.id),
    channel_account_id: channel.id,
    channel_type: channelType,
    external_thread_id: ticket.external_thread_id || payload.external_thread_id || "",
    external_message_id: payload.external_message_id || "",
    external_customer_id: ticket.external_customer_id || payload.external_customer_id || "",
    direction: "outbound",
    sender_name: payload.sender_name || "lights:off",
    sender_contact: payload.sender_contact || "",
    subject: payload.subject || "",
    body_text: truncate(payload.body_text || ""),
    delivery_status: payload.delivery_status || "sent",
    raw_payload: truncate(stringifyDetails(payload.raw_payload || {}))
  });
  await recordSendAttempt(base44, ticket, channelType, {
    ...payload,
    send_status: "sent"
  });
  return message;
}

// base44/functions/sendWhatsAppReply/entry.ts
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const base44 = createClientFromRequest(req);
  try {
    const user = await requireStaffOperator(base44);
    const body = await readJson(req);
    if (!body.ticket_id) return json({ success: false, error: "ticket_id required" }, 400);
    const tickets = await base44.asServiceRole.entities.Ticket.filter({ id: body.ticket_id });
    const ticket = tickets?.[0];
    if (!ticket) return json({ success: false, error: "Ticket not found" }, 404);
    assertTicketChannel(ticket, "whatsapp");
    const draft = await loadLinkedDraft(base44, body.ai_draft_id, ticket, "whatsapp");
    const to = body.to || ticket.external_customer_id;
    const text = body.body_text || draft?.edited_text || draft?.draft_text;
    const templateName = body.template_name || "";
    const languageCode = body.language_code || "en_US";
    const failAttempt = async (sendStatus, reason, status = 400, provider2 = null) => {
      await recordSendAttempt(base44, ticket, "whatsapp", {
        author_id: user.id,
        sender_name: user.full_name,
        body_text: templateName ? `[WhatsApp template requested: ${templateName}]` : text || "",
        send_status: sendStatus,
        reason,
        raw_payload: provider2
      });
      return json({ success: false, error: reason, provider: provider2 }, status);
    };
    if (!env("WHATSAPP_ACCESS_TOKEN") || !env("WHATSAPP_PHONE_NUMBER_ID")) {
      return await failAttempt("failed", "Missing Secrets: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID");
    }
    try {
      await requireChannelSendReady(base44, "whatsapp");
    } catch (error) {
      return await failAttempt("blocked", String(error?.message || error), 409);
    }
    if (!to) return await failAttempt("failed", "WhatsApp recipient required");
    if (!templateName && !text) return await failAttempt("failed", "Reply text required for free-form WhatsApp message");
    const insideWindow = whatsappWindowOpen(ticket);
    if (!insideWindow && !templateName) {
      await base44.asServiceRole.entities.Ticket.update(ticket.id, {
        send_policy_state: "blocked_whatsapp_template_required"
      });
      await recordSendAttempt(base44, ticket, "whatsapp", {
        author_id: user.id,
        sender_name: user.full_name,
        body_text: text || "",
        send_status: "blocked",
        reason: "WhatsApp free-form window is closed. Select an approved template before sending."
      });
      return json({
        success: false,
        blocked: true,
        error: "WhatsApp free-form window is closed. Select an approved template before sending."
      }, 403);
    }
    const request = buildWhatsAppMessageRequest({
      apiVersion: API_VERSION,
      accessToken: env("WHATSAPP_ACCESS_TOKEN"),
      phoneNumberId: env("WHATSAPP_PHONE_NUMBER_ID"),
      to,
      text,
      templateName,
      languageCode
    });
    const res = await fetch(request.url, request.init);
    const provider = await res.json().catch(() => ({}));
    if (!res.ok) return await failAttempt("failed", provider?.error?.message || `WhatsApp send failed: ${res.status}`, 502, provider);
    const sentText = templateName ? `[WhatsApp template sent: ${templateName}]` : text;
    const message = await markOutbound(base44, ticket, "whatsapp", {
      sender_name: user.full_name,
      body_text: sentText,
      external_message_id: provider.messages?.[0]?.id || "",
      raw_payload: provider
    });
    await base44.asServiceRole.entities.Ticket.update(ticket.id, {
      send_policy_state: insideWindow ? "sent_inside_service_window" : "sent_template"
    });
    if (draft) {
      await base44.asServiceRole.entities.AiDraft.update(draft.id, {
        approval_state: "sent",
        edited_text: body.body_text || draft.edited_text || "",
        approved_by_id: user.id,
        approved_by_name: user.full_name,
        approved_at: (/* @__PURE__ */ new Date()).toISOString(),
        send_policy_state: insideWindow ? "sent_inside_service_window" : "sent_template"
      });
    }
    return json({ success: true, message_id: message.id, provider });
  } catch (error) {
    return json({ success: false, error: String(error?.message || error) }, statusForError(error));
  }
});
