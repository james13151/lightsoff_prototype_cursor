// Generated from base44/functions/sendEmailReply/entry.ts. Do not edit directly.


// base44/functions/sendEmailReply/entry.ts
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
function missingEnv(names) {
  return names.filter((name) => !env(name));
}
function buildPostmarkEmailRequest(input) {
  const subject = String(input.subject || "Re: your message");
  const body = withoutUndefined({
    From: input.from,
    To: input.to,
    Subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
    TextBody: input.text,
    MessageStream: input.messageStream || void 0
  });
  return {
    url: "https://api.postmarkapp.com/email",
    init: {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": input.token,
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

// base44/functions/sendEmailReply/entry.ts
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
    assertTicketChannel(ticket, "email");
    const draft = await loadLinkedDraft(base44, body.ai_draft_id, ticket, "email");
    const latestInbound = await base44.asServiceRole.entities.ConversationMessage.filter({
      ticket_id: String(ticket.id),
      channel_type: "email",
      direction: "inbound"
    }, "-created_date", 1);
    const to = body.to || latestInbound?.[0]?.sender_contact || ticket.customer_contact;
    const subject = body.subject || latestInbound?.[0]?.subject || ticket.title || "Re: your message";
    const text = body.body_text || draft?.edited_text || draft?.draft_text;
    const failAttempt = async (sendStatus, reason, status = 400, provider2 = null) => {
      await recordSendAttempt(base44, ticket, "email", {
        author_id: user.id,
        sender_name: user.full_name,
        body_text: text || "",
        send_status: sendStatus,
        reason,
        raw_payload: provider2
      });
      return json({ success: false, error: reason, provider: provider2 }, status);
    };
    const missing = missingEnv(["POSTMARK_SERVER_TOKEN", "POSTMARK_FROM_EMAIL"]);
    if (missing.length) return await failAttempt("failed", `Missing Secrets: ${missing.join(", ")}`);
    try {
      await requireChannelSendReady(base44, "email");
    } catch (error) {
      return await failAttempt("blocked", String(error?.message || error), 409);
    }
    if (!to || !text) return await failAttempt("failed", "Recipient and reply text required");
    const request = buildPostmarkEmailRequest({
      token: env("POSTMARK_SERVER_TOKEN"),
      from: env("POSTMARK_FROM_EMAIL"),
      to,
      subject,
      text,
      messageStream: env("POSTMARK_MESSAGE_STREAM") || ""
    });
    const res = await fetch(request.url, request.init);
    const provider = await res.json().catch(() => ({}));
    if (!res.ok) return await failAttempt("failed", provider?.Message || `Postmark failed: ${res.status}`, 502, provider);
    const message = await markOutbound(base44, ticket, "email", {
      sender_name: user.full_name,
      sender_contact: env("POSTMARK_FROM_EMAIL"),
      subject,
      body_text: text,
      external_message_id: provider.MessageID || "",
      raw_payload: provider
    });
    if (draft) {
      await base44.asServiceRole.entities.AiDraft.update(draft.id, {
        approval_state: "sent",
        edited_text: body.body_text || draft.edited_text || "",
        approved_by_id: user.id,
        approved_by_name: user.full_name,
        approved_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    return json({ success: true, message_id: message.id, provider });
  } catch (error) {
    return json({ success: false, error: String(error?.message || error) }, statusForError(error));
  }
});
