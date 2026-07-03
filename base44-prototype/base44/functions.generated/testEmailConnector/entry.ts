// Generated from base44/functions/testEmailConnector/entry.ts. Do not edit directly.


// base44/functions/testEmailConnector/entry.ts
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

// base44/functions/testEmailConnector/entry.ts
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const base44 = createClientFromRequest(req);
  try {
    const user = await requireAdmin(base44);
    const body = await readJson(req);
    const missing = missingEnv(["POSTMARK_SERVER_TOKEN", "POSTMARK_FROM_EMAIL", "POSTMARK_INBOUND_WEBHOOK_SECRET"]);
    const channel = await upsertChannelAccount(base44, "email", {
      display_name: "Email / Postmark",
      webhook_url: body.webhook_url || "",
      setup_status: missing.length ? "needs_secrets" : "testing"
    });
    if (missing.length) {
      await recordConnectorTest(base44, user, "email", "secrets", "failed", `Missing Secrets: ${missing.join(", ")}`, { missing }, channel.id);
      return json({ success: false, missing, channel });
    }
    await recordConnectorTest(base44, user, "email", "secrets", "success", "Email Secrets are present.", { webhook_url: body.webhook_url || "" }, channel.id);
    const testTo = String(body.test_to || "").trim();
    if (!testTo) {
      const message = "Email test recipient required to prove outbound send readiness.";
      await recordConnectorTest(base44, user, "email", "outbound", "failed", message, { webhook_url: body.webhook_url || "" }, channel.id);
      return json({ success: false, error: message }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo)) {
      const message = "Email test recipient must be a valid email address.";
      await recordConnectorTest(base44, user, "email", "outbound", "failed", message, { test_to: testTo }, channel.id);
      return json({ success: false, error: message }, 400);
    }
    let outbound = "not_tested";
    if (testTo) {
      const res = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          "X-Postmark-Server-Token": env("POSTMARK_SERVER_TOKEN"),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          From: env("POSTMARK_FROM_EMAIL"),
          To: testTo,
          Subject: "lights:off email connector test",
          TextBody: "Postmark outbound test from lights:off Module 1.",
          MessageStream: env("POSTMARK_MESSAGE_STREAM") || void 0
        })
      });
      if (!res.ok) {
        const text = await res.text();
        await recordConnectorTest(base44, user, "email", "outbound", "failed", `Postmark send failed: ${res.status}`, text, channel.id);
        return json({ success: false, error: text }, 502);
      }
      outbound = "sent";
      await recordConnectorTest(base44, user, "email", "outbound", "success", "Postmark outbound test email sent.", { test_to: testTo }, channel.id, {
        send_enabled: true
      });
    }
    return json({ success: true, outbound });
  } catch (error) {
    return json({ success: false, error: String(error?.message || error) }, statusForError(error));
  }
});
