import React from 'react';
import OmnichannelSetup from './OmnichannelSetup';

const now = new Date('2026-06-09T02:00:00+08:00').toISOString();

const accounts = [
  {
    id: 'smoke-email',
    channel_type: 'email',
    display_name: 'Email',
    setup_status: 'degraded',
    webhook_status: 'healthy',
    receive_enabled: true,
    send_enabled: false,
    last_inbound_at: now,
    last_error: 'Waiting for outbound Postmark proof.',
  },
  {
    id: 'smoke-facebook',
    channel_type: 'facebook',
    display_name: 'Facebook Messenger',
    setup_status: 'degraded',
    webhook_status: 'unknown',
    receive_enabled: false,
    send_enabled: true,
    last_outbound_at: now,
    last_error: 'Waiting for first real inbound webhook.',
  },
  {
    id: 'smoke-instagram',
    channel_type: 'instagram',
    display_name: 'Instagram',
    setup_status: 'needs_secrets',
    webhook_status: 'unknown',
    receive_enabled: false,
    send_enabled: false,
    last_error: 'Missing Secret: META_INSTAGRAM_ACCOUNT_ID',
  },
  {
    id: 'smoke-whatsapp',
    channel_type: 'whatsapp',
    display_name: 'WhatsApp',
    setup_status: 'connected',
    webhook_status: 'healthy',
    receive_enabled: true,
    send_enabled: true,
    last_inbound_at: now,
    last_outbound_at: now,
  },
];

const runs = [
  {
    id: 'smoke-whatsapp-outbound',
    channel_type: 'whatsapp',
    test_type: 'outbound',
    status: 'success',
    message: 'WhatsApp Cloud API accepted the send request.',
    created_date: now,
  },
  {
    id: 'smoke-instagram-secrets',
    channel_type: 'instagram',
    test_type: 'secrets',
    status: 'failed',
    message: 'Missing Secret: META_INSTAGRAM_ACCOUNT_ID',
    created_date: now,
  },
  {
    id: 'smoke-facebook-outbound',
    channel_type: 'facebook',
    test_type: 'outbound',
    status: 'success',
    message: 'Meta Page token reached the messages endpoint.',
    created_date: now,
  },
  {
    id: 'smoke-email-inbound',
    channel_type: 'email',
    test_type: 'inbound',
    status: 'success',
    message: 'Postmark inbound fixture created a ConversationMessage.',
    created_date: now,
  },
];

export default function Module1LocalSmoke() {
  const smokeBaseUrl = new URLSearchParams(window.location.search).get('smoke_base_url') || 'https://your-app.base44.app';

  return (
    <OmnichannelSetup
      currentUser={{ id: 'module1-smoke-admin', full_name: 'Module 1 Smoke Admin', role: 'admin' }}
      accountsOverride={accounts}
      runsOverride={runs}
      functionBaseOverride={smokeBaseUrl}
      readOnly
    />
  );
}
