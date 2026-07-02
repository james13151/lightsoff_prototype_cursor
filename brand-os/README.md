# Brand OS — Prototype

An interactive prototype of **Brand OS**, the AI-driven brand operating system for solo Shopify operators described in the product roadmap. One AI operator sits across inventory, money, marketing, customer conversations, R&D, and internal coordination — surfacing only what needs a human decision today.

## Run it

```bash
npm install
npm run dev
```

Then open the printed local URL (default `http://localhost:5173`).

## What's in the prototype

The three UX surfaces from the spec:

1. **Capture** — the always-available "drop anything here" bar at the top. Type things like:
   - `Received 50 blue hoodies from Acme` → drafts an inventory receipt, matches it to the open PO, pushes stock to Shopify (simulated)
   - `Forwarded invoice from Pacific Trims for $560` → extracts a vendor bill into Finance
   - `Paid $18.40 for courier shipping to Uber` → expense claim; auto-applies or pauses depending on your confidence threshold
   - `Customer asking if the red one is back in stock` → routes to the Inbox with an AI-drafted reply grounded in live stock
   - `Sample arrived from Kyoto Fabric Lab — corduroy swatch` → sample receipt + auto-created R&D kanban card
   - Anything unrecognized → filed as an internal ticket so nothing gets lost

2. **Daily Digest** — the home screen. One prioritized feed across all six modules: low stock with AI reorder suggestions, bills due, escalated conversations, OOS-paused campaigns ready to resume, aging samples, and tickets awaiting you. Every item is actionable inline.

3. **Drill-down views** — traditional module screens (stock table, PO/receipt lists, journal, unified inbox, campaign list, kanban board, ticket list) for verification and edge cases.

Cross-module wiring demonstrated live:

- Paying a bill auto-posts a double-entry journal entry (Finance ← Inventory AP event)
- A captured sample receipt auto-creates an R&D kanban card (R&D ← Inventory event)
- The OOS ad guard holds a campaign while its SKU is out of stock, and surfaces a resume approval in the digest once restocked (Marketing ← Inventory events)
- Low-confidence expense claims route to an Internal Collab approval ticket; approving the ticket posts the journal entry and resolves the ticket (Collab ↔ Finance)
- Every action publishes to the **Event Bus** view — the append-only feed the digest is built on

Confidence-aware automation (spec §1.5) is adjustable in **AI Settings**: the auto-apply threshold changes whether a captured expense auto-posts (with an undo window) or pauses for approval.

## What's simulated

- The AI classifier (`src/ai/classify.ts`) is deterministic rules standing in for an LLM call, so demos behave predictably.
- Shopify / Meta / WhatsApp integrations are represented by seeded data and simulated sync events — no external calls.
- State is in-memory (refresh resets to the seeded scenario).

## Stack

Vite + React 19 + TypeScript + Tailwind CSS v4. No backend — the entity model from spec §7 lives in `src/types.ts`, seeded demo data in `src/data/seed.ts`, and all state transitions in a single reducer (`src/store.tsx`).
