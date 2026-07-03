// Generated from base44/functions/testWhatsAppConnector/entry.ts. Do not edit directly.


// base44/functions/testWhatsAppConnector/entry.ts
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
async function requireAdmin(base44) {
  return requireRole(await requireUser(base44), ["admin"]);
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
function stringifyDetails(value) {
  try {
    return JSON.stringify(value, null, 2).slice(0, 7e3);
  } catch {
    return String(value).slice(0, 7e3);
  }
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
async function recordConnectorTest(base44, user, channelType, testType, status, message, details = null, channelAccountId = "", readinessPatch = {}) {
  const run = await base44.asServiceRole.entities.ConnectorTestRun.create({
    channel_account_id: channelAccountId,
    channel_type: channelType,
    test_type: testType,
    status,
    message,
    details: details ? stringifyDetails(details) : "",
    tested_by_id: user?.id || "",
    tested_by_name: user?.full_name || "System"
  });
  if (status === "success") {
    const successPatch = {
      ...readinessPatch,
      last_test_at: (/* @__PURE__ */ new Date()).toISOString(),
      last_error: ""
    };
    if (testType === "webhook" || testType === "inbound") {
      successPatch.receive_enabled = true;
      successPatch.webhook_status = "healthy";
    }
    if (testType === "outbound") successPatch.send_enabled = true;
    if (!("send_enabled" in successPatch) && !("receive_enabled" in successPatch)) {
      successPatch.setup_status = "degraded";
    }
    await updateChannelReadiness(base44, channelType, successPatch);
  } else {
    const failurePatch = {
      setup_status: "error",
      last_test_at: (/* @__PURE__ */ new Date()).toISOString(),
      last_error: message,
      ...readinessPatch
    };
    if (testType === "webhook" || testType === "inbound") {
      failurePatch.webhook_status = "failing";
      failurePatch.receive_enabled = false;
    } else if (testType === "outbound") {
      failurePatch.send_enabled = false;
    } else if (testType === "secrets") {
      failurePatch.send_enabled = false;
      failurePatch.receive_enabled = false;
    }
    await updateChannelReadiness(base44, channelType, {
      ...failurePatch
    });
  }
  return run;
}

// base44/functions/testWhatsAppConnector/entry.ts
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const base44 = createClientFromRequest(req);
  try {
    const user = await requireAdmin(base44);
    const body = await readJson(req);
    const missing = missingEnv(["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_VERIFY_TOKEN", "META_APP_SECRET"]);
    const channel = await upsertChannelAccount(base44, "whatsapp", {
      display_name: "WhatsApp Cloud API",
      external_account_id: env("WHATSAPP_PHONE_NUMBER_ID"),
      webhook_url: body.webhook_url || "",
      setup_status: missing.length ? "needs_secrets" : "testing"
    });
    if (missing.length) {
      await recordConnectorTest(base44, user, "whatsapp", "secrets", "failed", `Missing Secrets: ${missing.join(", ")}`, { missing }, channel.id);
      return json({ success: false, missing, channel });
    }
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${env("WHATSAPP_PHONE_NUMBER_ID")}?fields=id,display_phone_number,verified_name`, {
      headers: { Authorization: `Bearer ${env("WHATSAPP_ACCESS_TOKEN")}` }
    });
    const provider = await res.json().catch(() => ({}));
    if (!res.ok) {
      await recordConnectorTest(base44, user, "whatsapp", "secrets", "failed", provider?.error?.message || "WhatsApp credential test failed", provider, channel.id);
      return json({ success: false, provider }, 502);
    }
    await recordConnectorTest(base44, user, "whatsapp", "secrets", "success", "WhatsApp credentials are valid. Waiting for first inbound webhook before marking connected.", provider, channel.id, {
      send_enabled: true
    });
    return json({ success: true, provider });
  } catch (error) {
    return json({ success: false, error: String(error?.message || error) }, statusForError(error));
  }
});
