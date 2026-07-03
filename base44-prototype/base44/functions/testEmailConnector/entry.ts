import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { env, json, missingEnv, readJson, recordConnectorTest, requireAdmin, statusForError, upsertChannelAccount } from '../../shared/omniShared.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const base44 = createClientFromRequest(req);
  try {
    const user = await requireAdmin(base44);
    const body = await readJson(req);
    const missing = missingEnv(['POSTMARK_SERVER_TOKEN', 'POSTMARK_FROM_EMAIL', 'POSTMARK_INBOUND_WEBHOOK_SECRET']);
    const channel = await upsertChannelAccount(base44, 'email', {
      display_name: 'Email / Postmark',
      webhook_url: body.webhook_url || '',
      setup_status: missing.length ? 'needs_secrets' : 'testing',
    });

    if (missing.length) {
      await recordConnectorTest(base44, user, 'email', 'secrets', 'failed', `Missing Secrets: ${missing.join(', ')}`, { missing }, channel.id);
      return json({ success: false, missing, channel });
    }

    await recordConnectorTest(base44, user, 'email', 'secrets', 'success', 'Email Secrets are present.', { webhook_url: body.webhook_url || '' }, channel.id);

    const testTo = String(body.test_to || '').trim();
    if (!testTo) {
      const message = 'Email test recipient required to prove outbound send readiness.';
      await recordConnectorTest(base44, user, 'email', 'outbound', 'failed', message, { webhook_url: body.webhook_url || '' }, channel.id);
      return json({ success: false, error: message }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo)) {
      const message = 'Email test recipient must be a valid email address.';
      await recordConnectorTest(base44, user, 'email', 'outbound', 'failed', message, { test_to: testTo }, channel.id);
      return json({ success: false, error: message }, 400);
    }

    let outbound = 'not_tested';
    if (testTo) {
      const res = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'X-Postmark-Server-Token': env('POSTMARK_SERVER_TOKEN'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          From: env('POSTMARK_FROM_EMAIL'),
          To: testTo,
          Subject: 'lights:off email connector test',
          TextBody: 'Postmark outbound test from lights:off Module 1.',
          MessageStream: env('POSTMARK_MESSAGE_STREAM') || undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        await recordConnectorTest(base44, user, 'email', 'outbound', 'failed', `Postmark send failed: ${res.status}`, text, channel.id);
        return json({ success: false, error: text }, 502);
      }
      outbound = 'sent';
      await recordConnectorTest(base44, user, 'email', 'outbound', 'success', 'Postmark outbound test email sent.', { test_to: testTo }, channel.id, {
        send_enabled: true,
      });
    }

    return json({ success: true, outbound });
  } catch (error) {
    return json({ success: false, error: String(error?.message || error) }, statusForError(error));
  }
});
