# Module 1 Product Spec: AI Omnichannel Inbox

Version: `v0.1`
Date: `2026-06-09 HKT`
Product: `lights:off`
Module: `Module 1 — Inbox + AI`
Status: Draft for founder/CTO alignment

## 1. Product Take

Module 1 is the front door of lights:off.

The product is an AI-first omnichannel chat interface for small ecommerce operators who currently answer customers across email, Facebook, Instagram, and WhatsApp manually. The user should feel like they are working inside one calm, prioritized inbox. The system should understand that every channel has different rules, identities, limits, and sending windows.

The important distinction: this is not "chatbot support." That category is crowded and boring. Module 1 is an operator cockpit. It reads messy inbound conversations, classifies what matters, drafts the right response, routes exceptions to the human, and eventually connects customer messages to inventory, orders, supplier issues, R&D, and marketing workflows.

## 2. Target User

Primary user:
- Founder/operator of a small ecommerce business with `0-5` staff.
- Manages customer support personally or with one helper.
- Sells cross-border through Shopify, TikTok Shop, Instagram, Facebook, Etsy, Shopee, or Kickstarter.
- Uses at least two customer channels and loses context switching between them.
- Cares about tone, speed, and not accidentally saying something stupid to a customer.

Concrete OMB-style examples:
- Customer wants to cancel before fulfillment.
- Customer says the wrong item arrived.
- Customer says an item broke and attaches photos.
- Customer asks where to buy or whether a SKU fits.
- Creator or distributor asks to collaborate.
- Customer messages in German, French, Spanish, Italian, Korean, or English.

## 3. Core Promise

One inbox. One customer timeline. AI handles the obvious. Human approves the sensitive.

Module 1 should save the operator time in three ways:
- Prioritize: surface urgent conversations first.
- Draft: generate replies in the seller's tone with channel-aware constraints.
- Route: connect messages to the right operational object, such as order, SKU, warehouse, supplier, R&D issue, collab lead, or refund decision.

## 4. Channels In Scope

### 4.1 Email

Requested integration: SMTP.

Important correction: SMTP is not enough for a full inbox by itself. SMTP can send mail and can receive mail only if lights:off operates an inbound SMTP server or provides forwarding addresses. To read an existing Gmail, Outlook, or custom mailbox, the product needs IMAP/OAuth or provider APIs.

MVP recommendation:
- Outbound: SMTP relay using the user's authenticated mailbox or a lights:off-managed relay.
- Inbound MVP: per-account forwarding address, e.g. `inbound-{account}.mail.lightsoff.app`, with instructions to forward support mail.
- Later: Gmail API, Microsoft Graph, IMAP OAuth, and custom domain inbound routing.

Email capabilities:
- Receive forwarded email into unified inbox.
- Send replies through configured SMTP identity.
- Preserve thread headers where possible: `Message-ID`, `In-Reply-To`, `References`.
- Support attachments and inline images.
- Detect original sender when email is forwarded.
- Show deliverability status: sent, bounced, failed, delayed.

### 4.2 Facebook Messenger

Integration surface:
- Meta Messenger Platform.
- Page-based messaging.
- Page access token required.
- App permissions and App Review required for production use.
- Webhooks for inbound messages and delivery/read events.

Product constraints:
- Facebook identity is Page-scoped, not user-email-scoped.
- The app must map Page, customer PSID, and conversation thread into a single normalized conversation.
- Sending rules must be enforced by backend policy, not left to UI copy.

### 4.3 Instagram Messaging

Integration surface:
- Instagram Messaging API / Instagram Platform.
- Requires Instagram Professional account setup.
- Usually depends on a linked Facebook Page and Page access token unless using newer Instagram-login-specific flows.
- Production access requires Meta permissions and App Review.

Product constraints:
- Onboarding must guide the seller through the Meta account/Page/Instagram linking mess. This needs a checklist, not a paragraph.
- Conversation identity may differ from Facebook identity even if it is the same real human.
- Media, story mentions, quick replies, reactions, and attachments should be normalized without losing channel-specific context.

### 4.4 WhatsApp Cloud API

Integration surface:
- Meta WhatsApp Cloud API.
- Requires WhatsApp Business setup, phone number, webhook subscription, and message templates for outbound conversations outside the service window.

Product constraints:
- WhatsApp has a customer-service window. When a user messages the business, a limited service window opens for free-form replies. Outside that window, outbound messages require approved templates.
- Template lifecycle is a product feature: create, submit, approve, map to use case, and select during reply.
- AI must never send non-template free-form WhatsApp messages outside the allowed window.
- The composer must clearly show whether the current conversation is inside or outside the reply window.

## 5. UX Principles

No ERP stink. No Zendesk clone energy.

The interface should be mobile-first, dense enough for operators, and calm enough for a tired founder answering messages at midnight.

Principles:
- One unified conversation list.
- AI summary visible before raw thread.
- Channel badges must be obvious.
- Urgency and required action must be more prominent than timestamp.
- Human approval is the default for risky actions.
- No full-screen setup labyrinth after first account connection.
- The app should explain channel blockers plainly: "WhatsApp free-form window closed. Use approved template."

## 6. Core User Flows

### 6.1 Connect a Channel

User goal: connect a business channel without needing a developer.

Flow:
1. User opens `Settings > Channels`.
2. User chooses Email, Facebook, Instagram, or WhatsApp.
3. System shows required prerequisites.
4. User authenticates or enters connector settings.
5. System runs a connection test.
6. System subscribes to webhooks or creates forwarding route.
7. System imports recent conversations where allowed.
8. User sees a health status for the channel.

Acceptance criteria:
- A non-technical founder can connect at least one channel in under 10 minutes.
- Failed setup produces a specific error and next action.
- Channel health shows `connected`, `degraded`, `needs reauth`, or `disconnected`.

### 6.2 Triage Morning Inbox

User goal: open lights:off and know what needs attention.

Flow:
1. User opens Inbox.
2. System shows prioritized queue:
   - urgent customer issue
   - refund/cancel window
   - wrong/damaged item
   - collaborator/distributor lead
   - waiting on customer
   - AI-resolvable FAQ
3. Each conversation shows:
   - AI summary
   - latest message
   - channel
   - language
   - linked customer/order/SKU if detected
   - recommended next action
4. User approves draft, edits draft, assigns, snoozes, or escalates.

Acceptance criteria:
- User can identify top 5 urgent conversations without opening every thread.
- AI-resolvable FAQ messages can be handled in two clicks.
- Risky tickets are never buried below low-value FAQs.

### 6.3 Reply With AI Draft

User goal: respond faster while preserving brand tone.

Flow:
1. User opens conversation.
2. AI generates:
   - short summary
   - detected intent
   - risk level
   - suggested reply
   - missing info checklist
3. User selects tone:
   - just right
   - warmer
   - firmer
   - shorter
   - translate
4. User edits or approves.
5. System sends through correct channel adapter.
6. Conversation timeline records sender, AI involvement, prompt/context version, and final content.

Acceptance criteria:
- Drafts should be useful for common FAQs, order status, collaboration qualification, and cancellation requests.
- The system must require human approval for refunds, cancellation decisions, legal threats, chargebacks, damaged-item claims, angry customers, public reputational risk, and anything involving payment change.

### 6.4 Auto-Resolve Low-Risk Message

User goal: let AI handle obvious, repetitive questions.

Free tier:
- No autonomous sending.
- User must confirm all AI replies.

Paid module / bundle:
- Optional auto-draft only.

Premium:
- Optional auto-send for approved low-risk intents only.
- Account-level and channel-level enablement required.
- Per-intent enablement required.
- Confidence threshold required.
- Daily auto-send cap required.
- Audit log required.

Allowed auto-send examples:
- "Where can I buy this?"
- "How do I place an order?"
- "What is your website?"
- "Do you ship to X?" only if policy exists.

Blocked from auto-send:
- refund/cancellation
- damaged/wrong item
- custom fitment uncertainty
- wholesale pricing
- legal/compliance
- payment disputes
- angry customer
- anything outside WhatsApp free-form window unless using an approved template intentionally configured for that use case

## 7. AI System Requirements

### 7.1 AI Jobs

The AI layer must perform these jobs:
- Summarize conversation.
- Detect language.
- Translate inbound and outbound messages.
- Classify intent.
- Classify risk.
- Detect sentiment.
- Extract entities:
  - customer name
  - order number
  - SKU/product
  - vehicle model/fitment if relevant
  - shipping address hints
  - phone/email/social handle
  - attachments/photos
- Recommend next action.
- Draft reply.
- Generate internal note.
- Suggest routing target.
- Detect stale waiting state.

### 7.2 Intent Taxonomy

MVP intents:
- `faq_where_to_buy`
- `faq_how_to_order`
- `order_status`
- `cancel_request`
- `wrong_item`
- `damaged_item`
- `return_refund`
- `fitment_question`
- `shipping_question`
- `collaboration_request`
- `distributor_request`
- `supplier_message`
- `spam_or_low_value`
- `angry_customer`
- `unknown`

### 7.3 Risk Levels

Risk levels:
- `low`: FAQ, website link, basic policy answer.
- `medium`: order lookup, shipping ETA, fitment question, collaboration qualification.
- `high`: cancellation, refund, wrong item, damaged item, chargeback, angry customer, legal threat.
- `blocked`: missing channel permission, WhatsApp window closed without template, disconnected channel, unknown identity, policy unavailable.

Behavior:
- `low`: can draft; premium may auto-send if configured.
- `medium`: draft only, human approval required by default.
- `high`: human approval required; show warning and missing facts.
- `blocked`: cannot send until blocker resolved.

### 7.4 Tone System

The tone system is a differentiator. Make it concrete.

Controls:
- `just_right`
- `warmer`
- `firmer`
- `shorter`
- `more_apologetic`
- `less_apologetic`
- `translate_to_customer_language`

Account training inputs:
- approved historical replies
- brand voice notes
- banned phrases
- required sign-off
- refund policy
- shipping policy
- fitment disclaimers
- market-specific wording

Hard rule: tone tuning changes wording, not policy. AI cannot invent refunds, discounts, shipping promises, or fitment guarantees.

## 8. Conversation Data Model

Recommended core objects:

### `ChannelAccount`

Fields:
- `id`
- `workspace_id`
- `channel_type`: `email`, `facebook`, `instagram`, `whatsapp`
- `external_account_id`
- `display_name`
- `status`
- `auth_status`
- `last_webhook_at`
- `last_sync_at`
- `send_enabled`
- `receive_enabled`
- `created_at`
- `updated_at`

### `Conversation`

Fields:
- `id`
- `workspace_id`
- `primary_customer_id`
- `channel_account_id`
- `channel_type`
- `external_thread_id`
- `status`: `open`, `waiting_on_customer`, `waiting_on_team`, `snoozed`, `closed`
- `priority`: `urgent`, `high`, `normal`, `low`
- `intent`
- `risk_level`
- `language`
- `summary`
- `last_message_at`
- `assigned_user_id`
- `linked_order_id`
- `linked_sku_id`
- `linked_task_id`
- `created_at`
- `updated_at`

### `Message`

Fields:
- `id`
- `conversation_id`
- `workspace_id`
- `channel_type`
- `external_message_id`
- `direction`: `inbound`, `outbound`, `internal`
- `sender_type`: `customer`, `user`, `ai`, `system`
- `sender_external_id`
- `body_text`
- `body_html`
- `attachments`
- `language`
- `sentiment`
- `delivery_status`
- `raw_payload_ref`
- `created_at`

### `AiRecommendation`

Fields:
- `id`
- `conversation_id`
- `message_id`
- `summary`
- `intent`
- `risk_level`
- `recommended_action`
- `draft_reply`
- `missing_info`
- `confidence_score`
- `policy_refs`
- `model_name`
- `prompt_version`
- `created_at`

### `SendPolicyDecision`

Fields:
- `id`
- `conversation_id`
- `message_id`
- `channel_type`
- `allowed`
- `reason`
- `requires_template`
- `requires_human_approval`
- `whatsapp_window_status`
- `computed_at`

## 9. Backend Architecture

### 9.1 Channel Adapters

Each channel gets an adapter with the same internal contract:
- `connect`
- `verify`
- `subscribe`
- `ingestWebhook`
- `importRecent`
- `normalizeMessage`
- `sendMessage`
- `sendTemplate`
- `markRead`
- `getHealth`

Adapters:
- `EmailAdapter`
- `FacebookMessengerAdapter`
- `InstagramMessagingAdapter`
- `WhatsAppCloudAdapter`

Internal normalized messages must retain raw payload references for audit and debugging.

### 9.2 Event Pipeline

Inbound path:
1. Webhook or email receiver receives event.
2. Signature/auth verification runs.
3. Raw payload is stored.
4. Payload is normalized.
5. Customer identity is resolved or created.
6. Conversation is resolved or created.
7. Message is stored.
8. AI triage job runs.
9. Send policy is computed.
10. UI queue updates in real time.

Outbound path:
1. User or AI produces draft.
2. System checks send policy.
3. System checks human approval requirement.
4. System sends through channel adapter.
5. Delivery status is recorded.
6. Timeline is updated.

### 9.3 Real-Time UX

Use WebSockets or server-sent events for:
- new inbound message
- draft ready
- send status changed
- channel health changed
- conversation priority changed

## 10. Channel Policy Rules

The backend must enforce channel policy before every send. UI warnings are not enough.

Rules:
- Email can send if SMTP identity is connected and sender identity is verified.
- Facebook can send only if Page token and required permission state are valid.
- Instagram can send only if connected account and permission state are valid.
- WhatsApp free-form send is allowed only inside customer-service window.
- WhatsApp outside-window sends require approved template selection.
- Auto-send cannot override channel policy.
- Beta outbound sends require an approved `AiDraft`; direct body-only send calls are rejected.
- Human approval cannot override missing legal/channel permission.

## 11. Privacy, Security, and Compliance

Minimum requirements:
- Encrypt access tokens at rest.
- Store raw webhook payloads separately from normalized message body.
- Support data export and deletion by workspace/customer.
- Log all AI-generated outbound content.
- Log whether AI drafted, user edited, or AI auto-sent.
- Do not train global models on customer content without explicit consent.
- Support per-workspace retention settings.
- PII redaction in logs.
- Webhook signature validation.
- Least-privilege channel permissions.
- Role-based access control before adding staff users.

Compliance posture:
- GDPR/PDPA/CCPA readiness is a product requirement, not a footer.
- Provide "delete customer conversation" and "export customer conversation" workflows in admin.
- Provide clear "AI uses message content to draft replies" disclosure in settings.

## 12. MVP Scope

### Must Ship for Beta

- Unified inbox list.
- Conversation detail view.
- Email forwarding inbound.
- SMTP outbound.
- WhatsApp Cloud API webhook inbound.
- WhatsApp Cloud API outbound within service window.
- Facebook Messenger inbound/outbound.
- Instagram Messaging inbound/outbound.
- AI summary.
- AI intent classification.
- AI risk classification.
- AI draft reply.
- Manual approve/edit/send.
- Channel health status.
- Basic attachment support.
- Audit log for outbound messages.
- Admin settings for brand voice and policies.

### Should Ship for Beta If Time Allows

- WhatsApp template manager.
- Auto-detect order number/SKU.
- Internal notes.
- Snooze/reminders.
- Conversation assignment.
- Saved replies.
- Multilingual tone tuning.
- One-click translate inbound/outbound.
- Stale thread detection.

### Defer

- Fully autonomous support bot.
- Complex team permissions.
- Native Gmail/Microsoft integrations.
- Deep Shopify order sync.
- Refund automation.
- Full CRM.
- Public API.
- Advanced analytics.
- AI voice calls.

## 13. Beta Acceptance Criteria

Beta is successful if:
- A seller can connect at least two channels.
- Inbound messages from all connected channels appear in one inbox.
- AI summary and draft appear for at least 80% of normal customer messages.
- AI correctly blocks or escalates high-risk messages.
- WhatsApp send rules are enforced correctly.
- Operator can clear a morning queue at least 30% faster than their current manual workflow.
- No AI auto-send happens unless explicitly enabled on premium config.
- Every outbound message has an audit trail.
- No customer message is lost during webhook failure or retry.

## 14. Metrics

Product metrics:
- connected channels per workspace
- active conversations per day
- median first response time
- percent conversations with useful AI draft
- percent AI drafts accepted without edit
- percent AI drafts edited
- percent messages auto-resolved
- percent high-risk conversations correctly escalated
- time saved per day, self-reported and estimated
- channel setup completion rate
- channel auth failure rate

Business metrics:
- free-to-paid conversion after first connected channel
- free-to-paid conversion after first AI draft accepted
- module retention at 30/60/90 days
- premium upgrade rate for auto-send
- churn reason: low volume, bad AI, setup failure, trust issue, price

## 15. Open Questions

- Is email MVP forwarding-only, or do we require IMAP/Gmail/Microsoft from day one?
- Which Meta integration path is fastest for beta: direct Meta app owned by lights:off, or per-customer business onboarding?
- Do we support WhatsApp templates in beta, or only inbound/service-window replies?
- Should premium auto-send exist in beta, or should it launch after 30 days of observed safe drafts?
- What order/SKU source is available for OMB during Module 1 beta?
- Which languages are mandatory for first beta: English plus DE/FR/ES/IT/KO?
- Who owns privacy/compliance requirements before CTO is hired?

## 16. Product Decisions Recommended Now

- Treat SMTP-only email as incomplete. Ship forwarding + SMTP for fastest beta, then add Gmail/Microsoft.
- Do not launch autonomous sending in beta. Launch AI draft and human approval first.
- Build WhatsApp policy enforcement before UI polish. Getting this wrong is expensive.
- Use OMB's Monday morning scenario as the seed dataset for demo and QA.
- Normalize everything into conversations/messages first. Do not create channel-specific UI forks.
- Make channel setup health visible. Meta auth will fail; pretending otherwise is how users rage-quit.

## 17. External API References

- WhatsApp Cloud API messaging: `https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages/`
- WhatsApp Cloud API webhooks: `https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/`
- Messenger Platform overview: `https://developers.facebook.com/docs/messenger-platform/`
- Messenger Conversations API: `https://developers.facebook.com/docs/messenger-platform/conversations/`
- Instagram Messaging API: `https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/`
