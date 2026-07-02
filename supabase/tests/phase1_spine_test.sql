-- ============================================================================
-- Phase 1 spine test suite: PO -> receipt -> ledger -> stock, discrepancy
-- flagging, bills -> journal auto-posting, payments/allocations, petty cash,
-- expense claims, journal balance enforcement, append-only guarantees.
-- Runs after rls_isolation_test.sql conventions: as `test_user` (authenticated).
-- ============================================================================

\set ON_ERROR_STOP on

\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'

create temp table t_ctx (
  tid        uuid,
  vendor_id  uuid,
  variant_id uuid,
  po_id      uuid,
  po_line_id uuid,
  receipt_id uuid,
  bill_id    uuid,
  payment_id uuid,
  claim_id   uuid
);
insert into t_ctx default values;

select set_config('request.jwt.claims', json_build_object('sub', :'alice')::text, false);

-- ---------------------------------------------------------------------------
-- Setup: tenant (chart of accounts must auto-seed), vendor, product/variant
-- ---------------------------------------------------------------------------
select app.create_tenant('Spine Test Co');
update t_ctx set tid = (select id from app.tenants where name = 'Spine Test Co');

do $$
begin
  if (select count(*) from app.accounts a join t_ctx c on a.tenant_id = c.tid) < 10 then
    raise exception 'ASSERT FAILED: default chart of accounts was not seeded';
  end if;
end;
$$;

insert into app.vendors (tenant_id, name, lead_time_days)
select tid, 'Acme Textiles', 12 from t_ctx;
update t_ctx set vendor_id = (select id from app.vendors v join t_ctx c on v.tenant_id = c.tid);

insert into app.products (tenant_id, shopify_product_id, title)
select tid, 1001, 'Blue Hoodie' from t_ctx;

insert into app.variants (tenant_id, product_id, sku, price, unit_cost, reorder_point)
select c.tid, p.id, 'HOOD-BLU-M', 68.00, 18.50, 20
from t_ctx c join app.products p on p.tenant_id = c.tid;
update t_ctx set variant_id = (select id from app.variants v join t_ctx c on v.tenant_id = c.tid);

-- ---------------------------------------------------------------------------
-- PO lifecycle: create -> send; po.created + po.sent events
-- ---------------------------------------------------------------------------
insert into app.purchase_orders (tenant_id, vendor_id, source)
select tid, vendor_id, 'ai_capture' from t_ctx;
update t_ctx set po_id = (select id from app.purchase_orders po join t_ctx c on po.tenant_id = c.tid);

insert into app.po_line_items (tenant_id, po_id, variant_id, qty, unit_cost)
select tid, po_id, variant_id, 100, 18.50 from t_ctx;
update t_ctx set po_line_id = (select id from app.po_line_items l join t_ctx c on l.po_id = c.po_id);

update app.purchase_orders set status = 'sent' where id = (select po_id from t_ctx);

do $$
declare c t_ctx;
begin
  select * into c from t_ctx;
  if not exists (select 1 from app.events where type = 'po.created' and payload->>'po_id' = c.po_id::text) then
    raise exception 'ASSERT FAILED: po.created event missing';
  end if;
  if not exists (select 1 from app.events where type = 'po.sent' and payload->>'po_id' = c.po_id::text) then
    raise exception 'ASSERT FAILED: po.sent event missing';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Receipt with shortfall (97 of 100): ledger entry, stock, discrepancy event,
-- PO -> partially_received
-- ---------------------------------------------------------------------------
insert into app.receipts (tenant_id, po_id, vendor_id, type)
select tid, po_id, vendor_id, 'commercial' from t_ctx;
update t_ctx set receipt_id = (select id from app.receipts r join t_ctx c on r.tenant_id = c.tid);

insert into app.receipt_line_items (tenant_id, receipt_id, po_line_item_id, variant_id, qty)
select tid, receipt_id, po_line_id, variant_id, 97 from t_ctx;

select app.finalize_receipt((select receipt_id from t_ctx));

do $$
declare
  c t_ctx;
  stock integer;
begin
  select * into c from t_ctx;

  select on_hand into stock from app.current_stock where variant_id = c.variant_id;
  if stock <> 97 then
    raise exception 'ASSERT FAILED: stock should be 97, got %', stock;
  end if;

  if not exists (
    select 1 from app.inventory_ledger_entries
    where variant_id = c.variant_id and qty_delta = 97 and reason = 'po_receipt' and ref_id = c.receipt_id
  ) then
    raise exception 'ASSERT FAILED: ledger entry for receipt missing';
  end if;

  if not exists (
    select 1 from app.events
    where type = 'inventory.discrepancy_flagged'
      and payload->>'kind' = 'shortfall'
      and (payload->>'received_total')::int = 97
  ) then
    raise exception 'ASSERT FAILED: shortfall discrepancy event missing';
  end if;

  if (select status from app.purchase_orders where id = c.po_id) <> 'partially_received' then
    raise exception 'ASSERT FAILED: PO should be partially_received';
  end if;

  -- double-finalize must fail
  begin
    perform app.finalize_receipt(c.receipt_id);
    raise exception 'ASSERT FAILED: receipt finalized twice';
  exception when others then
    if sqlerrm like 'ASSERT FAILED%' then raise; end if;
  end;
end;
$$;

-- Second receipt for the remaining 3 -> PO fully received
insert into app.receipts (tenant_id, po_id, vendor_id, type)
select tid, po_id, vendor_id, 'commercial' from t_ctx;

insert into app.receipt_line_items (tenant_id, receipt_id, po_line_item_id, variant_id, qty)
select c.tid, r.id, c.po_line_id, c.variant_id, 3
from t_ctx c
join app.receipts r on r.tenant_id = c.tid and r.finalized_at is null;

select app.finalize_receipt((select id from app.receipts r join t_ctx c on r.tenant_id = c.tid and r.finalized_at is null));

do $$
declare c t_ctx;
begin
  select * into c from t_ctx;
  if (select status from app.purchase_orders where id = c.po_id) <> 'received' then
    raise exception 'ASSERT FAILED: PO should be received after remaining qty arrives';
  end if;
  if (select on_hand from app.current_stock where variant_id = c.variant_id) <> 100 then
    raise exception 'ASSERT FAILED: stock should be 100 after both receipts';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sample receipt: line without variant leaves stock untouched
-- ---------------------------------------------------------------------------
insert into app.receipts (tenant_id, vendor_id, type)
select tid, vendor_id, 'sample' from t_ctx;

insert into app.receipt_line_items (tenant_id, receipt_id, description, qty)
select c.tid, r.id, 'Heavyweight slub cotton swatch', 2
from t_ctx c join app.receipts r on r.tenant_id = c.tid and r.finalized_at is null;

select app.finalize_receipt((select id from app.receipts r join t_ctx c on r.tenant_id = c.tid and r.finalized_at is null));

do $$
declare c t_ctx;
begin
  select * into c from t_ctx;
  if (select on_hand from app.current_stock where variant_id = c.variant_id) <> 100 then
    raise exception 'ASSERT FAILED: sample receipt must not change commercial stock';
  end if;
  if not exists (
    select 1 from app.events where type = 'inventory.received' and payload->>'receipt_type' = 'sample'
  ) then
    raise exception 'ASSERT FAILED: sample inventory.received event missing';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bill -> auto journal (Inventory <- AP), partial + final payments,
-- allocation guards, bill.paid event
-- ---------------------------------------------------------------------------
insert into app.vendor_bills (tenant_id, vendor_id, po_id, bill_number, amount, due_date)
select tid, vendor_id, po_id, 'INV-100', 1850.00, current_date + 14 from t_ctx;
update t_ctx set bill_id = (select id from app.vendor_bills b join t_ctx c on b.tenant_id = c.tid);

do $$
declare
  c t_ctx;
  ap_balance numeric;
begin
  select * into c from t_ctx;
  if not exists (
    select 1 from app.journal_entries
    where ref_type = 'vendor_bill' and ref_id = c.bill_id and source = 'inventory_ap'
  ) then
    raise exception 'ASSERT FAILED: bill journal entry not auto-posted';
  end if;
  select -net_debit into ap_balance from app.account_balances where code = '2000' and tenant_id = c.tid;
  if ap_balance <> 1850.00 then
    raise exception 'ASSERT FAILED: AP should be 1850, got %', ap_balance;
  end if;
end;
$$;

-- Partial payment (1000)
insert into app.vendor_payments (tenant_id, vendor_id, amount, memo)
select tid, vendor_id, 1000.00, 'first installment' from t_ctx;
update t_ctx set payment_id = (select id from app.vendor_payments p join t_ctx c on p.tenant_id = c.tid);

insert into app.vendor_payment_allocations (tenant_id, payment_id, bill_id, amount)
select tid, payment_id, bill_id, 1000.00 from t_ctx;

do $$
declare c t_ctx;
begin
  select * into c from t_ctx;
  if (select status from app.vendor_bills where id = c.bill_id) <> 'partially_paid' then
    raise exception 'ASSERT FAILED: bill should be partially_paid';
  end if;
  -- over-allocation must fail
  begin
    insert into app.vendor_payment_allocations (tenant_id, payment_id, bill_id, amount)
    values (c.tid, c.payment_id, c.bill_id, 5000.00);
    raise exception 'ASSERT FAILED: over-allocation accepted';
  exception when others then
    if sqlerrm like 'ASSERT FAILED%' then raise; end if;
  end;
end;
$$;

-- Final payment (850) -> bill paid, cash credited total 1850
insert into app.vendor_payments (tenant_id, vendor_id, amount)
select tid, vendor_id, 850.00 from t_ctx;

insert into app.vendor_payment_allocations (tenant_id, payment_id, bill_id, amount)
select c.tid, p.id, c.bill_id, 850.00
from t_ctx c join app.vendor_payments p on p.tenant_id = c.tid and p.amount = 850.00;

do $$
declare
  c t_ctx;
  cash numeric;
begin
  select * into c from t_ctx;
  if (select status from app.vendor_bills where id = c.bill_id) <> 'paid' then
    raise exception 'ASSERT FAILED: bill should be paid';
  end if;
  if not exists (select 1 from app.events where type = 'bill.paid' and payload->>'bill_id' = c.bill_id::text) then
    raise exception 'ASSERT FAILED: bill.paid event missing';
  end if;
  select net_debit into cash from app.account_balances where code = '1000' and tenant_id = c.tid;
  if cash <> -1850.00 then
    raise exception 'ASSERT FAILED: cash should be -1850 (no revenue yet), got %', cash;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Journal integrity: unbalanced entries rejected; direct DML rejected;
-- journal + ledger rows immutable
-- ---------------------------------------------------------------------------
do $$
declare c t_ctx;
begin
  select * into c from t_ctx;
  begin
    perform app.post_journal_entry(c.tid, 'bad', 'manual',
      '[{"account_code":"1000","debit":100,"credit":0},{"account_code":"4000","debit":0,"credit":99}]'::jsonb);
    raise exception 'ASSERT FAILED: unbalanced journal entry accepted';
  exception when others then
    if sqlerrm like 'ASSERT FAILED%' then raise; end if;
  end;
  begin
    insert into app.journal_entries (tenant_id, memo) values (c.tid, 'direct insert');
    raise exception 'ASSERT FAILED: direct journal insert accepted';
  exception
    when insufficient_privilege then null;
    when others then if sqlerrm like 'ASSERT FAILED%' then raise; end if;
  end;
  begin
    update app.inventory_ledger_entries set qty_delta = 999 where tenant_id = c.tid;
    raise exception 'ASSERT FAILED: inventory ledger updatable';
  exception
    when insufficient_privilege then null;
    when others then if sqlerrm like 'ASSERT FAILED%' then raise; end if;
  end;
end;
$$;

-- Balanced manual entry works (owner capital injection)
select app.post_journal_entry(
  (select tid from t_ctx), 'Owner capital', 'manual',
  '[{"account_code":"1000","debit":5000,"credit":0},{"account_code":"3000","debit":0,"credit":5000}]'::jsonb);

-- ---------------------------------------------------------------------------
-- Expense claims: member submits; admin approves -> journal + petty cash
-- ---------------------------------------------------------------------------
insert into app.expense_claims (tenant_id, claimant_id, vendor_name, amount, category_account_id, confidence, source)
select tid, '11111111-1111-1111-1111-111111111111', 'Uber Freight', 74.20,
       app.account_id_by_code(tid, '6100'), 0.72, 'ai_capture'
from t_ctx;
update t_ctx set claim_id = (select id from app.expense_claims e join t_ctx c on e.tenant_id = c.tid);

select app.approve_expense_claim((select claim_id from t_ctx));

do $$
declare
  c t_ctx;
  petty numeric;
begin
  select * into c from t_ctx;
  if (select status from app.expense_claims where id = c.claim_id) <> 'approved' then
    raise exception 'ASSERT FAILED: claim should be approved';
  end if;
  if not exists (select 1 from app.journal_entries where ref_type = 'expense_claim' and ref_id = c.claim_id) then
    raise exception 'ASSERT FAILED: claim journal entry missing';
  end if;
  select coalesce(sum(delta), 0) into petty from app.petty_cash_entries where tenant_id = c.tid;
  if petty <> -74.20 then
    raise exception 'ASSERT FAILED: petty cash should be -74.20, got %', petty;
  end if;
  -- double-approve must fail
  begin
    perform app.approve_expense_claim(c.claim_id);
    raise exception 'ASSERT FAILED: claim approved twice';
  exception when others then
    if sqlerrm like 'ASSERT FAILED%' then raise; end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cross-tenant spot check: bob sees none of the spine data
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :'bob')::text, false);

do $$
begin
  if (select count(*) from app.purchase_orders) <> 0
     or (select count(*) from app.vendor_bills) <> 0
     or (select count(*) from app.journal_entries) <> 0
     or (select count(*) from app.current_stock) <> 0
     or (select count(*) from app.expense_claims) <> 0 then
    raise exception 'ASSERT FAILED: cross-tenant leak in phase 1 tables';
  end if;
end;
$$;

select 'ALL PHASE 1 TESTS PASSED' as result;
