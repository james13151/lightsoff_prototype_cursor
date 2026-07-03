import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { API_VERSION, env, json, missingEnv, readJson, recordConnectorTest, requireAdmin, statusForError, upsertChannelAccount } from '../../shared/omniShared.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const base44 = createClientFromRequest(req);
  try {
    const user = await requireAdmin(base44);
    const body = await readJson(req);
    const channelType = body.channel_type || 'facebook';
    if (!['facebook', 'instagram'].includes(channelType)) return json({ success: false, error: 'channel_type must be facebook or instagram' }, 400);
    const accountSecret = channelType === 'instagram' ? 'META_INSTAGRAM_ACCOUNT_ID' : 'META_PAGE_ID';
    const missing = missingEnv(['META_PAGE_ACCESS_TOKEN', accountSecret, 'META_VERIFY_TOKEN', 'META_APP_SECRET']);
    const channel = await upsertChannelAccount(base44, channelType, {
      display_name: channelType === 'instagram' ? 'Instagram' : 'Facebook Messenger',
      external_account_id: env(accountSecret),
      webhook_url: body.webhook_url || '',
      setup_status: missing.length ? 'needs_secrets' : 'testing',
    });
    if (missing.length) {
      await recordConnectorTest(base44, user, channelType, 'secrets', 'failed', `Missing Secrets: ${missing.join(', ')}`, { missing }, channel.id);
      return json({ success: false, missing, channel });
    }
    const fields = channelType === 'instagram' ? 'id,username' : 'id,name';
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${env(accountSecret)}?fields=${fields}&access_token=${env('META_PAGE_ACCESS_TOKEN')}`);
    const provider = await res.json().catch(() => ({}));
    if (!res.ok) {
      await recordConnectorTest(base44, user, channelType, 'secrets', 'failed', provider?.error?.message || 'Meta credential test failed', provider, channel.id);
      return json({ success: false, provider }, 502);
    }
    await recordConnectorTest(base44, user, channelType, 'secrets', 'success', `${channel.display_name} credentials are valid. Waiting for first inbound webhook before marking connected.`, provider, channel.id, {
      send_enabled: true,
    });
    return json({ success: true, provider });
  } catch (error) {
    return json({ success: false, error: String(error?.message || error) }, statusForError(error));
  }
});
