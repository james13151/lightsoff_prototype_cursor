-- ============================================================================
-- LightsOff — Phase 1: The Spine (Inventory & Procurement + Finance)
-- ============================================================================
-- Implements spec §4.1/§4.2 with the full entity set from §7.2/§7.3:
--   Inventory: purchase_orders + line items, receipts (commercial|sample),
--              inventory_ledger_entries (source of truth for stock),
--              fulfillments, receipt finalization with discrepancy flagging
--   Finance:   chart of accounts (seeded per tenant), double-entry journal
--              (balance-enforced, posted only through a function),
--              vendor bills/payments/allocations with automatic journal
--              posting, petty cash ledger, expense claims
--
-- Follows the Phase 0 patterns: tenant_id + RLS on every table, lifecycle
-- events published to app.events, append-only financial records.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Finance: chart of accounts (needed first — inventory triggers post to it)
-- ----------------------------------------------------------------------------

create type app.account_type as enum ('asset', 'liability', 'equity', 'revenue', 'expense');

create table app.accounts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  code        text not null check (code ~ '^[0-9]{4}$'),
  name        text not null,
  type        app.account_type not null,
  is_system   boolean not null default false, -- seeded accounts the app relies on
  created_at  timestamptz not null default now(),
  unique (tenant_id, code)
);

create index accounts_tenant_idx on app.accounts (tenant_id);

alter table app.accounts enable row level security;
create policy accounts_select on app.accounts
  for select using (app.is_tenant_member(tenant_id));
create policy accounts_insert on app.accounts
  for insert with check (app.has_role(tenant_id, 'admin') and not is_system);

-- Every tenant gets the same default chart; module code references accounts
-- by these codes (single ledger, no shadow ledgers — spec §4.2).
create function app.seed_default_accounts()
returns trigger language plpgsql security definer set search_path = app as $$
begin
  insert into app.accounts (tenant_id, code, name, type, is_system) values
    (new.id, '1000', 'Cash',               'asset',     true),
    (new.id, '1100', 'Petty Cash',         'asset',     true),
    (new.id, '1200', 'Inventory',          'asset',     true),
    (new.id, '2000', 'Accounts Payable',   'liability', true),
    (new.id, '3000', 'Owner Equity',       'equity',    true),
    (new.id, '4000', 'Sales Revenue',      'revenue',   true),
    (new.id, '5000', 'Cost of Goods Sold', 'expense',   true),
    (new.id, '6000', 'Advertising',        'expense',   true),
    (new.id, '6100', 'Shipping & Freight', 'expense',   true),
    (new.id, '6200', 'Software',           'expense',   true),
    (new.id, '6300', 'Meals & Entertainment', 'expense', true),
    (new.id, '6900', 'General Expense',    'expense',   true);
  return new;
end;
$$;

create trigger tenants_seed_accounts
  after insert on app.tenants
  for each row execute function app.seed_default_accounts();

create function app.account_id_by_code(t uuid, account_code text)
returns uuid language sql stable security definer set search_path = app as $$
  select id from app.accounts where tenant_id = t and code = account_code;
$$;

-- ----------------------------------------------------------------------------
-- Finance: double-entry journal
-- ----------------------------------------------------------------------------
-- Journal rows are only writable through post_journal_entry(), which enforces
-- balance atomically. Direct DML is revoked below; rows are immutable.

create type app.journal_source as enum
  ('manual', 'inventory_ap', 'vendor_payment', 'expense_claim', 'ad_spend', 'shopify_revenue');

create table app.journal_entries (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  memo        text not null,
  source      app.journal_source not null default 'manual',
  ref_type    text,
  ref_id      uuid,
  posted_at   timestamptz not null default now(),
  created_by  uuid
);

create index journal_entries_tenant_idx on app.journal_entries (tenant_id, posted_at);

create table app.journal_lines (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  entry_id    uuid not null references app.journal_entries(id) on delete cascade,
  account_id  uuid not null references app.accounts(id),
  debit       numeric(12,2) not null default 0 check (debit >= 0),
  credit      numeric(12,2) not null default 0 check (credit >= 0),
  check (debit = 0 or credit = 0),
  check (debit + credit > 0)
);

create index journal_lines_entry_idx on app.journal_lines (entry_id);
create index journal_lines_account_idx on app.journal_lines (account_id);

alter table app.journal_entries enable row level security;
alter table app.journal_lines   enable row level security;
create policy journal_entries_select on app.journal_entries
  for select using (app.is_tenant_member(tenant_id));
create policy journal_lines_select on app.journal_lines
  for select using (app.is_tenant_member(tenant_id));

create function app.journal_immutable()
returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

create trigger journal_entries_immutable
  before update or delete on app.journal_entries
  for each row execute function app.journal_immutable();
create trigger journal_lines_immutable
  before update or delete on app.journal_lines
  for each row execute function app.journal_immutable();

-- lines: [{"account_code": "2000", "debit": 100, "credit": 0}, ...]
create function app.post_journal_entry(
  t uuid,
  entry_memo text,
  entry_source app.journal_source,
  lines jsonb,
  entry_ref_type text default null,
  entry_ref_id uuid default null
) returns uuid
language plpgsql security definer set search_path = app
as $$
declare
  entry_id uuid;
  line jsonb;
  acct uuid;
  total_debit numeric(12,2) := 0;
  total_credit numeric(12,2) := 0;
begin
  if not app.is_tenant_member(t) then
    raise exception 'not a member of tenant %', t;
  end if;
  if jsonb_array_length(lines) < 2 then
    raise exception 'journal entry needs at least 2 lines';
  end if;

  for line in select * from jsonb_array_elements(lines) loop
    total_debit  := total_debit  + coalesce((line->>'debit')::numeric(12,2), 0);
    total_credit := total_credit + coalesce((line->>'credit')::numeric(12,2), 0);
  end loop;
  if total_debit <> total_credit or total_debit = 0 then
    raise exception 'journal entry does not balance (debits % vs credits %)', total_debit, total_credit;
  end if;

  insert into app.journal_entries (tenant_id, memo, source, ref_type, ref_id, created_by)
  values (t, entry_memo, entry_source, entry_ref_type, entry_ref_id, auth.uid())
  returning id into entry_id;

  for line in select * from jsonb_array_elements(lines) loop
    acct := app.account_id_by_code(t, line->>'account_code');
    if acct is null then
      raise exception 'unknown account code % for tenant', line->>'account_code';
    end if;
    insert into app.journal_lines (tenant_id, entry_id, account_id, debit, credit)
    values (t, entry_id, acct,
            coalesce((line->>'debit')::numeric(12,2), 0),
            coalesce((line->>'credit')::numeric(12,2), 0));
  end loop;

  insert into app.events (tenant_id, type, payload, emitted_by)
  values (t, 'journal.posted',
          jsonb_build_object('entry_id', entry_id, 'source', entry_source, 'memo', entry_memo),
          auth.uid());
  return entry_id;
end;
$$;

-- Live balances straight from the journal — "no separate reporting layer"
-- (spec §4.2). security_invoker so RLS of the underlying tables applies.
create view app.account_balances with (security_invoker = true) as
select
  a.tenant_id,
  a.id as account_id,
  a.code,
  a.name,
  a.type,
  coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0) as net_debit
from app.accounts a
left join app.journal_lines jl on jl.account_id = a.id
group by a.tenant_id, a.id, a.code, a.name, a.type;

-- ----------------------------------------------------------------------------
-- Inventory: purchase orders
-- ----------------------------------------------------------------------------

create type app.po_status as enum
  ('draft', 'sent', 'partially_received', 'received', 'closed', 'cancelled');

create table app.purchase_orders (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  vendor_id   uuid not null references app.vendors(id),
  status      app.po_status not null default 'draft',
  source      text not null default 'manual' check (source in ('manual', 'ai_capture', 'ai_reorder')),
  expected_at date,
  notes       text,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index purchase_orders_tenant_idx on app.purchase_orders (tenant_id, status);

create table app.po_line_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  po_id       uuid not null references app.purchase_orders(id) on delete cascade,
  variant_id  uuid references app.variants(id),
  description text, -- for samples / items with no SKU yet
  qty         integer not null check (qty > 0),
  unit_cost   numeric(12,2) not null default 0 check (unit_cost >= 0),
  check (variant_id is not null or description is not null)
);

create index po_line_items_po_idx on app.po_line_items (po_id);

create trigger purchase_orders_touch
  before update on app.purchase_orders
  for each row execute function app.touch_updated_at();

-- Lifecycle events: po.created on insert, po.<status> on status change.
create function app.purchase_orders_emit_event()
returns trigger language plpgsql security definer set search_path = app as $$
begin
  if tg_op = 'INSERT' then
    insert into app.events (tenant_id, type, payload, emitted_by)
    values (new.tenant_id, 'po.created',
            jsonb_build_object('po_id', new.id, 'vendor_id', new.vendor_id, 'source', new.source),
            auth.uid());
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into app.events (tenant_id, type, payload, emitted_by)
    values (new.tenant_id, 'po.' || new.status,
            jsonb_build_object('po_id', new.id, 'vendor_id', new.vendor_id),
            auth.uid());
  end if;
  return new;
end;
$$;

create trigger purchase_orders_event
  after insert or update on app.purchase_orders
  for each row execute function app.purchase_orders_emit_event();

alter table app.purchase_orders enable row level security;
alter table app.po_line_items   enable row level security;
create policy purchase_orders_all on app.purchase_orders
  for all using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
create policy po_line_items_all on app.po_line_items
  for all using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

-- ----------------------------------------------------------------------------
-- Inventory: receipts + the inventory ledger
-- ----------------------------------------------------------------------------

create type app.receipt_type as enum ('commercial', 'sample');

create table app.receipts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references app.tenants(id) on delete cascade,
  po_id         uuid references app.purchase_orders(id),
  vendor_id     uuid not null references app.vendors(id),
  type          app.receipt_type not null default 'commercial',
  received_at   timestamptz not null default now(),
  finalized_at  timestamptz, -- set by finalize_receipt(); lines are inert until then
  notes         text,
  created_by    uuid,
  created_at    timestamptz not null default now()
);

create index receipts_tenant_idx on app.receipts (tenant_id);
create index receipts_po_idx on app.receipts (po_id);

create table app.receipt_line_items (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references app.tenants(id) on delete cascade,
  receipt_id      uuid not null references app.receipts(id) on delete cascade,
  po_line_item_id uuid references app.po_line_items(id),
  variant_id      uuid references app.variants(id),
  description     text,
  qty             integer not null check (qty > 0),
  check (variant_id is not null or description is not null)
);

create index receipt_line_items_receipt_idx on app.receipt_line_items (receipt_id);

alter table app.receipts enable row level security;
alter table app.receipt_line_items enable row level security;
create policy receipts_all on app.receipts
  for all using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
create policy receipt_line_items_all on app.receipt_line_items
  for all using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

-- The actual source of truth for stock (spec §7.2). Append-only; rows are
-- created by finalize_receipt(), Shopify sale ingestion, or manual
-- adjustments — never edited.
create type app.ledger_reason as enum
  ('po_receipt', 'sample_receipt', 'shopify_sale', 'manual_adjustment', 'fulfillment');

create table app.inventory_ledger_entries (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  variant_id  uuid not null references app.variants(id),
  qty_delta   integer not null check (qty_delta <> 0),
  reason      app.ledger_reason not null,
  ref_type    text,
  ref_id      uuid,
  location    text not null default 'default',
  created_at  timestamptz not null default now()
);

create index ile_tenant_variant_idx on app.inventory_ledger_entries (tenant_id, variant_id);

alter table app.inventory_ledger_entries enable row level security;
create policy ile_select on app.inventory_ledger_entries
  for select using (app.is_tenant_member(tenant_id));
create policy ile_insert on app.inventory_ledger_entries
  for insert with check (app.is_tenant_member(tenant_id));

create trigger ile_immutable
  before update or delete on app.inventory_ledger_entries
  for each row execute function app.journal_immutable();

create view app.current_stock with (security_invoker = true) as
select
  v.tenant_id,
  v.id as variant_id,
  v.sku,
  v.reorder_point,
  coalesce(sum(ile.qty_delta), 0)::integer as on_hand
from app.variants v
left join app.inventory_ledger_entries ile on ile.variant_id = v.id
group by v.tenant_id, v.id, v.sku, v.reorder_point;

-- Finalizing a receipt is the moment stock moves (spec §4.1 core flow):
--   * writes inventory_ledger_entries for every line with a variant
--     (sample lines without a variant leave stock untouched — they become
--     R&D kanban cards in Phase 3)
--   * rolls the PO status forward (partially_received / received)
--   * flags qty discrepancies vs the PO instead of silently accepting them
create function app.finalize_receipt(p_receipt_id uuid)
returns void
language plpgsql security definer set search_path = app
as $$
declare
  r app.receipts;
  line record;
  po_line record;
  any_outstanding boolean;
begin
  select * into r from app.receipts where id = p_receipt_id;
  if r.id is null or not app.is_tenant_member(r.tenant_id) then
    raise exception 'receipt not found';
  end if;
  if r.finalized_at is not null then
    raise exception 'receipt already finalized';
  end if;

  update app.receipts set finalized_at = now() where id = r.id;

  -- Stock movements
  for line in
    select * from app.receipt_line_items where receipt_id = r.id and variant_id is not null
  loop
    insert into app.inventory_ledger_entries (tenant_id, variant_id, qty_delta, reason, ref_type, ref_id)
    values (r.tenant_id, line.variant_id, line.qty,
            case when r.type = 'sample' then 'sample_receipt'::app.ledger_reason
                 else 'po_receipt'::app.ledger_reason end,
            'receipt', r.id);
  end loop;

  insert into app.events (tenant_id, type, payload, emitted_by)
  values (r.tenant_id, 'inventory.received',
          jsonb_build_object('receipt_id', r.id, 'po_id', r.po_id, 'receipt_type', r.type),
          auth.uid());

  -- PO reconciliation + discrepancy flagging
  if r.po_id is not null then
    any_outstanding := false;
    for po_line in
      select pli.id, pli.qty as ordered,
             coalesce((
               select sum(rli.qty) from app.receipt_line_items rli
               join app.receipts rr on rr.id = rli.receipt_id
               where rli.po_line_item_id = pli.id and rr.finalized_at is not null
             ), 0) as received_total
      from app.po_line_items pli
      where pli.po_id = r.po_id
    loop
      if po_line.received_total < po_line.ordered then
        any_outstanding := true;
      end if;
      if po_line.received_total <> po_line.ordered then
        insert into app.events (tenant_id, type, payload, emitted_by)
        values (r.tenant_id, 'inventory.discrepancy_flagged',
                jsonb_build_object(
                  'receipt_id', r.id, 'po_id', r.po_id, 'po_line_item_id', po_line.id,
                  'ordered', po_line.ordered, 'received_total', po_line.received_total,
                  'kind', case when po_line.received_total > po_line.ordered then 'over_receipt' else 'shortfall' end),
                auth.uid());
      end if;
    end loop;

    update app.purchase_orders
       set status = case when any_outstanding then 'partially_received'::app.po_status
                         else 'received'::app.po_status end
     where id = r.po_id
       and status in ('sent', 'partially_received', 'draft');
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Inventory: fulfillments (Shopify order -> shipped/tracking write-back target)
-- ----------------------------------------------------------------------------

create table app.fulfillments (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references app.tenants(id) on delete cascade,
  shopify_order_id  bigint not null,
  status            text not null default 'pending' check (status in ('pending', 'shipped', 'delivered', 'cancelled')),
  carrier           text,
  tracking_number   text,
  shipped_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, shopify_order_id)
);

create trigger fulfillments_touch
  before update on app.fulfillments
  for each row execute function app.touch_updated_at();

alter table app.fulfillments enable row level security;
create policy fulfillments_all on app.fulfillments
  for all using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

-- ----------------------------------------------------------------------------
-- Finance: vendor bills, payments, allocations (AP side of the spine)
-- ----------------------------------------------------------------------------

create type app.bill_status as enum ('unpaid', 'partially_paid', 'paid', 'void');

create table app.vendor_bills (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references app.tenants(id) on delete cascade,
  vendor_id           uuid not null references app.vendors(id),
  po_id               uuid references app.purchase_orders(id),
  bill_number         text,
  amount              numeric(12,2) not null check (amount > 0),
  issued_at           date not null default current_date,
  due_date            date,
  status              app.bill_status not null default 'unpaid',
  expense_account_id  uuid references app.accounts(id), -- defaults to Inventory (1200) in trigger
  memo                text,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index vendor_bills_tenant_idx on app.vendor_bills (tenant_id, status);

create trigger vendor_bills_touch
  before update on app.vendor_bills
  for each row execute function app.touch_updated_at();

create table app.vendor_payments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  vendor_id   uuid not null references app.vendors(id),
  amount      numeric(12,2) not null check (amount > 0),
  method      text not null default 'bank_transfer',
  paid_at     timestamptz not null default now(),
  memo        text,
  created_by  uuid,
  created_at  timestamptz not null default now()
);

-- Join table so partial and batch payments stay clean (spec §7.2).
create table app.vendor_payment_allocations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  payment_id  uuid not null references app.vendor_payments(id) on delete cascade,
  bill_id     uuid not null references app.vendor_bills(id),
  amount      numeric(12,2) not null check (amount > 0),
  unique (payment_id, bill_id)
);

create index vpa_bill_idx on app.vendor_payment_allocations (bill_id);

alter table app.vendor_bills enable row level security;
alter table app.vendor_payments enable row level security;
alter table app.vendor_payment_allocations enable row level security;
create policy vendor_bills_all on app.vendor_bills
  for all using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
create policy vendor_payments_all on app.vendor_payments
  for all using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
create policy vpa_all on app.vendor_payment_allocations
  for all using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

-- Bill created -> journal auto-posts (expense/asset <- AP) + bill.created event.
-- "Auto-posted from Inventory's AP events" (spec §4.2).
create function app.vendor_bills_on_insert()
returns trigger language plpgsql security definer set search_path = app as $$
declare
  expense_code text;
begin
  if new.expense_account_id is null then
    new.expense_account_id := app.account_id_by_code(new.tenant_id, '1200'); -- Inventory
  end if;
  select code into expense_code from app.accounts where id = new.expense_account_id;

  perform app.post_journal_entry(
    new.tenant_id,
    'Bill ' || coalesce(new.bill_number, left(new.id::text, 8)) || ' — ' ||
      (select name from app.vendors where id = new.vendor_id),
    'inventory_ap',
    jsonb_build_array(
      jsonb_build_object('account_code', expense_code, 'debit', new.amount, 'credit', 0),
      jsonb_build_object('account_code', '2000', 'debit', 0, 'credit', new.amount)
    ),
    'vendor_bill', new.id
  );

  insert into app.events (tenant_id, type, payload, emitted_by)
  values (new.tenant_id, 'bill.created',
          jsonb_build_object('bill_id', new.id, 'vendor_id', new.vendor_id,
                             'amount', new.amount, 'due_date', new.due_date),
          auth.uid());
  return new;
end;
$$;

create trigger vendor_bills_insert
  before insert on app.vendor_bills
  for each row execute function app.vendor_bills_on_insert();

-- Payment created -> journal auto-posts (AP <- Cash) + event.
create function app.vendor_payments_on_insert()
returns trigger language plpgsql security definer set search_path = app as $$
begin
  perform app.post_journal_entry(
    new.tenant_id,
    'Payment to ' || (select name from app.vendors where id = new.vendor_id),
    'vendor_payment',
    jsonb_build_array(
      jsonb_build_object('account_code', '2000', 'debit', new.amount, 'credit', 0),
      jsonb_build_object('account_code', '1000', 'debit', 0, 'credit', new.amount)
    ),
    'vendor_payment', new.id
  );
  insert into app.events (tenant_id, type, payload, emitted_by)
  values (new.tenant_id, 'payment.recorded',
          jsonb_build_object('payment_id', new.id, 'vendor_id', new.vendor_id, 'amount', new.amount),
          auth.uid());
  return new;
end;
$$;

create trigger vendor_payments_insert
  after insert on app.vendor_payments
  for each row execute function app.vendor_payments_on_insert();

-- Allocations keep bill status truthful and guard against over-allocation.
create function app.vpa_on_insert()
returns trigger language plpgsql security definer set search_path = app as $$
declare
  bill app.vendor_bills;
  payment app.vendor_payments;
  allocated_to_bill numeric(12,2);
  allocated_from_payment numeric(12,2);
  new_status app.bill_status;
begin
  select * into bill from app.vendor_bills where id = new.bill_id;
  select * into payment from app.vendor_payments where id = new.payment_id;

  if bill.tenant_id <> new.tenant_id or payment.tenant_id <> new.tenant_id then
    raise exception 'allocation crosses tenants';
  end if;
  if bill.status = 'void' then
    raise exception 'cannot allocate to a void bill';
  end if;

  select coalesce(sum(amount), 0) + new.amount into allocated_to_bill
  from app.vendor_payment_allocations where bill_id = new.bill_id;
  if allocated_to_bill > bill.amount then
    raise exception 'allocation exceeds bill amount (% > %)', allocated_to_bill, bill.amount;
  end if;

  select coalesce(sum(amount), 0) + new.amount into allocated_from_payment
  from app.vendor_payment_allocations where payment_id = new.payment_id;
  if allocated_from_payment > payment.amount then
    raise exception 'allocations exceed payment amount';
  end if;

  new_status := case when allocated_to_bill = bill.amount then 'paid'::app.bill_status
                     else 'partially_paid'::app.bill_status end;
  update app.vendor_bills set status = new_status where id = bill.id;

  if new_status = 'paid' then
    insert into app.events (tenant_id, type, payload, emitted_by)
    values (new.tenant_id, 'bill.paid',
            jsonb_build_object('bill_id', bill.id, 'vendor_id', bill.vendor_id, 'amount', bill.amount),
            auth.uid());
  end if;
  return new;
end;
$$;

create trigger vpa_insert
  before insert on app.vendor_payment_allocations
  for each row execute function app.vpa_on_insert();

-- ----------------------------------------------------------------------------
-- Finance: petty cash + expense claims
-- ----------------------------------------------------------------------------

create table app.petty_cash_entries (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references app.tenants(id) on delete cascade,
  custodian_id  uuid not null, -- user holding the cash
  delta         numeric(12,2) not null check (delta <> 0),
  reason        text not null,
  ref_type      text,
  ref_id        uuid,
  created_at    timestamptz not null default now()
);

create index petty_cash_tenant_idx on app.petty_cash_entries (tenant_id, custodian_id);

alter table app.petty_cash_entries enable row level security;
create policy petty_cash_select on app.petty_cash_entries
  for select using (app.is_tenant_member(tenant_id));

create trigger petty_cash_immutable
  before update or delete on app.petty_cash_entries
  for each row execute function app.journal_immutable();

create type app.claim_status as enum ('pending_review', 'approved', 'rejected');

create table app.expense_claims (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references app.tenants(id) on delete cascade,
  claimant_id          uuid not null,
  vendor_name          text not null,
  amount               numeric(12,2) not null check (amount > 0),
  category_account_id  uuid not null references app.accounts(id),
  claimed_at           date not null default current_date,
  status               app.claim_status not null default 'pending_review',
  confidence           numeric(3,2) check (confidence between 0 and 1), -- AI extraction confidence
  source               text not null default 'manual' check (source in ('manual', 'ai_capture')),
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index expense_claims_tenant_idx on app.expense_claims (tenant_id, status);

create trigger expense_claims_touch
  before update on app.expense_claims
  for each row execute function app.touch_updated_at();

create function app.expense_claims_on_insert()
returns trigger language plpgsql security definer set search_path = app as $$
begin
  insert into app.events (tenant_id, type, payload, emitted_by)
  values (new.tenant_id, 'claim.submitted',
          jsonb_build_object('claim_id', new.id, 'amount', new.amount,
                             'confidence', new.confidence, 'source', new.source),
          auth.uid());
  return new;
end;
$$;

create trigger expense_claims_insert
  after insert on app.expense_claims
  for each row execute function app.expense_claims_on_insert();

alter table app.expense_claims enable row level security;
create policy expense_claims_select on app.expense_claims
  for select using (app.is_tenant_member(tenant_id));
create policy expense_claims_insert on app.expense_claims
  for insert with check (app.is_tenant_member(tenant_id) and claimant_id = auth.uid());
-- Status changes only through the functions below (no update policy).

-- Approval requires admin (role/permission boundary — spec §9); posts the
-- journal entry and the petty-cash movement atomically.
create function app.approve_expense_claim(claim_id uuid)
returns void
language plpgsql security definer set search_path = app
as $$
declare
  claim app.expense_claims;
  category_code text;
begin
  select * into claim from app.expense_claims where id = claim_id;
  if claim.id is null or not app.is_tenant_member(claim.tenant_id) then
    raise exception 'claim not found';
  end if;
  if not app.has_role(claim.tenant_id, 'admin') then
    raise exception 'admin role required to approve claims';
  end if;
  if claim.status <> 'pending_review' then
    raise exception 'claim is not pending review';
  end if;

  select code into category_code from app.accounts where id = claim.category_account_id;

  update app.expense_claims set status = 'approved' where id = claim.id;

  perform app.post_journal_entry(
    claim.tenant_id,
    'Expense claim — ' || claim.vendor_name,
    'expense_claim',
    jsonb_build_array(
      jsonb_build_object('account_code', category_code, 'debit', claim.amount, 'credit', 0),
      jsonb_build_object('account_code', '1100', 'debit', 0, 'credit', claim.amount)
    ),
    'expense_claim', claim.id
  );

  insert into app.petty_cash_entries (tenant_id, custodian_id, delta, reason, ref_type, ref_id)
  values (claim.tenant_id, claim.claimant_id, -claim.amount,
          'Expense claim — ' || claim.vendor_name, 'expense_claim', claim.id);

  insert into app.events (tenant_id, type, payload, emitted_by)
  values (claim.tenant_id, 'claim.approved',
          jsonb_build_object('claim_id', claim.id, 'amount', claim.amount),
          auth.uid());
end;
$$;

create function app.reject_expense_claim(claim_id uuid)
returns void
language plpgsql security definer set search_path = app
as $$
declare
  claim app.expense_claims;
begin
  select * into claim from app.expense_claims where id = claim_id;
  if claim.id is null or not app.is_tenant_member(claim.tenant_id) then
    raise exception 'claim not found';
  end if;
  if not app.has_role(claim.tenant_id, 'admin') then
    raise exception 'admin role required to reject claims';
  end if;
  if claim.status <> 'pending_review' then
    raise exception 'claim is not pending review';
  end if;
  update app.expense_claims set status = 'rejected' where id = claim.id;
  insert into app.events (tenant_id, type, payload, emitted_by)
  values (claim.tenant_id, 'claim.rejected',
          jsonb_build_object('claim_id', claim.id), auth.uid());
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------

grant select, insert, update, delete on all tables in schema app to authenticated;
grant usage on all sequences in schema app to authenticated;
grant execute on all functions in schema app to authenticated;
grant select on app.current_stock, app.account_balances to authenticated;

-- Financial records are append-only and/or function-gated:
revoke update, delete on app.events from authenticated;
revoke insert, update on app.integration_credentials from authenticated;
revoke insert, update, delete on app.journal_entries from authenticated;
revoke insert, update, delete on app.journal_lines from authenticated;
revoke update, delete on app.inventory_ledger_entries from authenticated;
revoke insert, update, delete on app.petty_cash_entries from authenticated;
revoke update, delete on app.expense_claims from authenticated;
