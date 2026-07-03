import { base44 } from '@/api/base44Client';
import { appParams } from '@/lib/app-params';

export const CHANNELS = [
  {
    type: 'email',
    label: 'Email',
    subtitle: 'Postmark inbound parse + SMTP/API send',
    webhookFunction: 'receivePostmarkInbound',
    testFunction: 'testEmailConnector',
    sendFunction: 'sendEmailReply',
    requiredSecrets: ['POSTMARK_SERVER_TOKEN', 'POSTMARK_FROM_EMAIL', 'POSTMARK_INBOUND_WEBHOOK_SECRET'],
    setupNotes: [
      'Create a Postmark server.',
      'Set inbound forwarding to the webhook URL.',
      'Store the inbound secret in Base44 and append it as ?secret=... in Postmark.',
      'Enter a real test recipient before running Test connector; outbound is not ready until Postmark sends successfully.',
    ],
  },
  {
    type: 'facebook',
    label: 'Facebook Messenger',
    subtitle: 'Meta Page messaging',
    webhookFunction: 'receiveMetaWebhook',
    webhookQuery: 'channel=facebook',
    testFunction: 'testMetaConnector',
    sendFunction: 'sendMetaReply',
    requiredSecrets: ['META_PAGE_ACCESS_TOKEN', 'META_PAGE_ID', 'META_VERIFY_TOKEN', 'META_APP_SECRET'],
    setupNotes: [
      'Use a Page access token with Messenger permissions.',
      'Subscribe the app webhook to Page messages.',
      'Meta App Review may be required before production use.',
    ],
  },
  {
    type: 'instagram',
    label: 'Instagram',
    subtitle: 'Instagram professional account messaging',
    webhookFunction: 'receiveMetaWebhook',
    webhookQuery: 'channel=instagram',
    testFunction: 'testMetaConnector',
    sendFunction: 'sendMetaReply',
    requiredSecrets: ['META_PAGE_ACCESS_TOKEN', 'META_INSTAGRAM_ACCOUNT_ID', 'META_VERIFY_TOKEN', 'META_APP_SECRET'],
    setupNotes: [
      'Use a professional Instagram account connected to Meta messaging.',
      'Store the Instagram account id and Page access token.',
      'Subscribe messaging webhooks in Meta.',
    ],
  },
  {
    type: 'whatsapp',
    label: 'WhatsApp',
    subtitle: 'WhatsApp Cloud API',
    webhookFunction: 'receiveWhatsAppWebhook',
    testFunction: 'testWhatsAppConnector',
    sendFunction: 'sendWhatsAppReply',
    requiredSecrets: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN', 'META_APP_SECRET'],
    setupNotes: [
      'Configure the WhatsApp Cloud API phone number.',
      'Use the webhook URL as the callback URL.',
      'Free-form replies are blocked outside the 24-hour service window unless a template is selected.',
    ],
  },
];

export function getFunctionUrl(functionName, query = '', baseOverride = undefined) {
  const base = baseOverride || appParams.appBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const warning = getFunctionBaseWarning(base);
  if (warning) return '';
  const cleanBase = String(base || '').replace(/\/$/, '');
  const suffix = query ? `?${query}` : '';
  return `${cleanBase}/functions/${functionName}${suffix}`;
}

export function getFunctionBaseWarning(base = appParams.appBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')) {
  if (!base) return 'Publish the app and set the published/default Base44 function base before copying webhook URLs.';
  try {
    const url = new URL(base);
    if (url.hostname === 'app.base44.com' || url.pathname.includes('/editor/preview')) {
      return 'Webhook callbacks need the published/default Base44 function base, not the editor preview URL.';
    }
    if (['localhost', '127.0.0.1', '::1'].includes(url.hostname) || url.protocol !== 'https:') {
      return 'Webhook callbacks need a published HTTPS Base44 function base, not a local development URL.';
    }
  } catch {
    return 'Base44 function base URL is invalid.';
  }
  return '';
}

export async function invokeOmniFunction(functionName, payload = {}) {
  const response = await base44.functions.invoke(functionName, payload);
  return response?.data ?? response;
}

export async function sendDraftReply({ channelType, ticketId, aiDraftId, bodyText, templateName, languageCode }) {
  const channel = CHANNELS.find((item) => item.type === channelType);
  if (!channel?.sendFunction) throw new Error(`No send function configured for ${channelType || 'unknown channel'}`);
  return invokeOmniFunction(channel.sendFunction, {
    channel_type: channelType,
    ticket_id: ticketId,
    ai_draft_id: aiDraftId,
    body_text: bodyText,
    template_name: templateName,
    language_code: languageCode,
  });
}
