# lights:off Study Notes — 2026-06-08

Sources studied:
- `/Users/karl/Desktop/lightsoff_alignment_brief.pdf`
- `/Users/karl/Desktop/lightsoff_market_validation.pdf`
- `/Users/karl/Desktop/omb_live_ops_showcase.pdf`

## Core Thesis

lights:off is a Brand OS / one-stop integration assistant for solopreneurs and very small ecommerce teams. The sharp positioning is not "another Shopify app"; it is an operational continuity layer that connects inbox, inventory, supplier follow-up, R&D, collabs, marketing, and bookkeeping for sellers currently running across disconnected tools.

The buying argument: these sellers already spend roughly `$80-200/mo` on fragmented SaaS. A `$79/mo` bundle can be framed as stack consolidation, not a new expense.

## Target Customer

- Solopreneurs and SMBs with `0-5` staff.
- Sellers operating across Shopify, Shopee, TikTok Shop, Etsy, and Kickstarter.
- Especially cross-border Asian sellers going West: multi-currency, multilingual customer support, supplier coordination, warehouses, and jurisdiction messiness are native to the problem.
- Existing confirmed beta surface: ONEMINIBITE plus 3 other users. That is enough for product feedback, not enough for stress testing.

## Pricing

- Free forever: one module, manual confirm, basic inbox summary, 3 AI messages/actions cap, data retained.
- Per-module: `$15-20/mo` each.
- Bundle: all 6 modules for `$79/mo`.
- Premium: `$99/mo`, full suite plus learned AI, account-trained tone/suppliers, auto-send, priority support.

Auto-send is powerful but risky. It should be premium-only and guarded by confidence thresholds, permission scopes, audit logs, and rollback paths.

## Product Modules

Stated modules:
- Inbox + AI: unified inbox, multilingual summaries, tone tuning, manual confirm by default, premium auto-send.
- Inventory: restock alerts, in-transit tracking, multi-warehouse, supplier PO sync, pre-stock vs preorder logic.
- Bookkeeping: recurring fees, supplier bills, rent, cash/P2P, bank OCR/XLS import, reimbursements, multi-currency/tax awareness.
- Marketing planner: influencer/collab CRM, ad planner, SEO/GEO suggestions, upsell pipeline, shopping calendar.
- R&D pipeline: supplier/partner project management, stale thread detection, Notion/Kanban/XLS import.
- UI/UX/privacy standard: mobile-first, non-ERP aesthetic, GDPR/PDPA/CCPA treated as product features.

Module taxonomy needs cleanup. The docs promise 6 modules, but the showcase uses both "Module D — Collab CRM + Distribution" and "Module D — Marketing Planner", while bookkeeping is absent from the live showcase. This should be fixed before pitch, pricing, or product architecture hardens.

## Moat

The actual moat is lived workflow depth:
- ONEMINIBITE dogfooding: Shopify, HK entity, Shanghai suppliers, Taiwan ops, Tucson warehouse, 5-language CS, 124 SKUs, dealer network.
- Real multilingual support in German, French, Spanish, Italian, Korean.
- Supplier loop depth: PO, restock, shipment, R&D, packaging, warehouse, and customer messaging connect.
- Cross-border native assumptions: multiple currencies, jurisdictions, suppliers, warehouses, and language contexts.
- Dealer/distributor network as a B2B beta surface.
- Warm Shopify APAC relationship as strategic signal and potential exit path.
- ERP sales network for rep sourcing.

The moat is not "AI". Everyone has AI. The moat is the graph of real operational objects and how one event updates the others.

## OMB Live Demo

The OMB showcase is the strongest asset.

One Monday at OMB:
- 26 open items total.
- 3 urgent CS items.
- 4 inventory flags.
- 8 R&D pending items.
- 8 collab/distribution items.
- 3 marketing tasks.
- 7 customer messages: 3 require human decision, 4 can be auto-drafted or fully handled by AI.

Best demo narrative:
- Broken item CS ticket flags packaging optimization in R&D.
- Wrong item ticket triggers inventory adjustment and Tucson warehouse workflow.
- Shanghai shortage, Tucson reorder planning, and US hard-stop date surface as one decision chain.
- CA collab confirmed creates onboarding checklist and content schedule.
- UK collab fitment routes to supplier/R&D thread.
- Stale supplier/partner conversations get auto-flagged.

This is also the best ad creative: "Here is what my morning looked like before / after."

## Market Model

Claimed universe:
- Shopify: 6.9M merchants globally; 90% small businesses.
- Etsy: 5.6M active sellers; 82% solo-operated.
- TikTok Shop: 15M+ sellers globally.
- Shopee: estimated 12M+ SE Asia merchants.
- Combined addressable universe: roughly 30-35M small sellers.

Specific 5% Shopify SMB scenario:
- Shopify merchants: 6.9M.
- Estimated Shopify SMB 0-5 staff target: about 5.5M.
- 5% penetration: 275,000 paying users.
- Conservative `$29/mo` ARPU: `$8M MRR`, `$96M ARR`.
- Realistic `$49/mo` ARPU: `$13.5M MRR`, `$162M ARR`.
- Upside `$69/mo` ARPU: `$19M MRR`, `$228M ARR`.

Near-term trajectory:
- Sep-Dec 2026: 150-300 paying users, `$12-24K MRR`.
- Q1-Q2 2027: 1,000-2,000 users, `$79-158K MRR`.
- End 2027: 10,000-20,000 users, `$790K-1.6M MRR`.
- Long-term ceiling: 275,000 users, `$13.5M+ MRR`, `$162M+ ARR`.

These are directional, not proof. The TAM numbers and competitor prices need source-backed validation before investor use.

## Competitive Frame

Competitors are fragmented:
- Gorgias: strong Shopify CS, but inbox-only and gets expensive.
- Linnworks / Cin7: inventory and ops, but mid-market/ERP-ish and expensive.
- Brightpearl / Rithum: retail ops, not solopreneur-friendly.
- Zendesk / Freshdesk: general enterprise helpdesk, not ecommerce-native.
- Tidio / Richpanel: affordable CS, but not full ops.
- Ecomzy: solopreneur-oriented, but store-builder/marketing angle rather than ops continuity.

The clean claim: lights:off replaces the disconnected stack for sellers too small for ERP but too complex for single-purpose apps.

## Critical Risks

- No CTO yet. This is the timeline breaker.
- Product surface is too wide for a small founding team.
- Module taxonomy is muddy.
- Auto-send creates brand, refund, compliance, and liability risk.
- Privacy compliance ownership is undefined.
- "Rebound ad revenue" is under-defined and could feel sketchy unless opt-in and transparent.
- CAC claims need real tests. Paid search in ecommerce SaaS gets expensive fast.
- 50% year-one sales commission may work for zero fixed burn, but it must be modeled cleanly as CAC/commission drag.
- Shopify and Gorgias can copy broad features. The defense has to be workflow depth and speed.
- Solopreneur churn is structural. Hibernation mode and free tier are smart mitigations.

## Take

The strongest version of lights:off is not "build six modules." That is how teams drown.

The right wedge is:
1. Inbox + AI as the front door.
2. Inventory/supplier/R&D graph as the hard-to-copy engine.
3. Collab/marketing tasks generated from that graph.
4. Bookkeeping later, once transaction data and supplier bills already flow through the system.

The OMB showcase should drive the MVP. Build the software that makes that Monday morning demo real.

## Immediate Next Moves

- Lock CTO equity range before approaching candidates.
- Rename and normalize the module map.
- Build an object model around messages, SKUs, POs, shipments, suppliers, warehouses, R&D projects, collabs, marketing tasks, and accounting events.
- Turn the OMB showcase into a clickable prototype or working demo.
- Put domain + waitlist live.
- Validate TAM and competitor claims from primary sources.
- Expand beta list to 20-50 users, specifically including high-SKU Etsy/TikTok sellers, multi-currency sellers, and physical + online hybrid sellers.
- Define privacy/compliance owner and auto-send safety model now, not after the product starts sending customer replies.
