// Generated from base44/functions/createAiDraftForTicket/entry.ts. Do not edit directly.


// base44/functions/createAiDraftForTicket/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

// base44/shared/omniShared.ts
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

// base44/functions/createAiDraftForTicket/entry.ts
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const base44 = createClientFromRequest(req);
  try {
    await requireStaffOperator(base44);
    const body = await readJson(req);
    if (!body.ticket_id) return json({ success: false, error: "ticket_id required" }, 400);
    const tickets = await base44.asServiceRole.entities.Ticket.filter({ id: body.ticket_id });
    const ticket = tickets?.[0];
    if (!ticket) return json({ success: false, error: "Ticket not found" }, 404);
    const messages = await base44.asServiceRole.entities.ConversationMessage.filter({ ticket_id: String(ticket.id) }, "-created_date", 1);
    const message = messages?.[0] || {
      id: "",
      ticket_id: ticket.id,
      channel_type: ticket.channel_type || "email",
      body_text: ticket.title,
      sender_name: ticket.customer_name
    };
    const draft = await createAiDraft(base44, ticket, message);
    return json({ success: true, draft });
  } catch (error) {
    return json({ success: false, error: String(error?.message || error) }, statusForError(error));
  }
});
