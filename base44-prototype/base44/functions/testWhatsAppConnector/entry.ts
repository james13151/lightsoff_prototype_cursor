import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { API_VERSION, env, json, missingEnv, readJson, recordConnectorTest, requireAdmin, statusForError, upsertChannelAccount } from '../../shared/omniShared.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const base44 = createClientFromRequest(req);
  try {
    const user = await requireAdmin(base44);
    const body = await readJson(req);
    const missing = missingEnv(['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN', 'META_APP_SECRET']);
    const channel = await upsertChannelAccount(base44, 'whatsapp', {
      display_name: 'WhatsApp Cloud API',
      external_account_id: env('WHATSAPP_PHONE_NUMBER_ID'),
      webhook_url: body.webhook_url || '',
      setup_status: missing.length ? 'needs_secrets' : 'testing',
    });
    if (missing.length) {
      await recordConnectorTest(base44, user, 'whatsapp', 'secrets', 'failed', `Missing Secrets: ${missing.join(', ')}`, { missing }, channel.id);
      return json({ success: false, missing, channel });
    }
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${env('WHATSAPP_PHONE_NUMBER_ID')}?fields=id,display_phone_number,verified_name`, {
      headers: { Authorization: `Bearer ${env('WHATSAPP_ACCESS_TOKEN')}` },
    });
    const provider = await res.json().catch(() => ({}));
    if (!res.ok) {
      await recordConnectorTest(base44, user, 'whatsapp', 'secrets', 'failed', provider?.error?.message || 'WhatsApp credential test failed', provider, channel.id);
      return json({ success: false, provider }, 502);
    }
    await recordConnectorTest(base44, user, 'whatsapp', 'secrets', 'success', 'WhatsApp credentials are valid. Waiting for first inbound webhook before marking connected.', provider, channel.id, {
      send_enabled: true,
    });
    return json({ success: true, provider });
  } catch (error) {
    return json({ success: false, error: String(error?.message || error) }, statusForError(error));
  }
});
