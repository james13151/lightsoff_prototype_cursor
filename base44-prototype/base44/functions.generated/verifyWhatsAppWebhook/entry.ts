// Generated from base44/functions/verifyWhatsAppWebhook/entry.ts. Do not edit directly.


// base44/shared/omniShared.ts
function json(data, status = 200) {
  return Response.json(data, { status });
}
function env(name) {
  return Deno.env.get(name) || "";
}

// base44/functions/verifyWhatsAppWebhook/entry.ts
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") || "";
  if (mode === "subscribe" && token === env("WHATSAPP_VERIFY_TOKEN")) {
    return new Response(challenge, { status: 200 });
  }
  return json({ error: "WhatsApp webhook verification failed" }, 403);
});
