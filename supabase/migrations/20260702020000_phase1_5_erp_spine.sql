-- ============================================================================
-- LightsOff — Phase 1.5: ERP-ready spine refinements
-- ============================================================================
--   * Product master: attributes, option matrix (Size/Color/etc.), variant options
--   * Document numbers + richer PO/receipt/bill/payment linkage
--   * Vendor bills: header + line items (linked to PO lines / receipts)
--   * Payments: multi-bill partial allocations (API surfaced; DB already supported)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Product master enrichment
-- ----------------------------------------------------------------------------

alter table app.products
  add column if not exists description      text,
  add column if not exists brand            text,
  add column if not exists product_type     text,
  add column if not exists default_vendor_id uuid references app.vendors(id),
  add column if not exists custom_attributes jsonb not null default '{}'::jsonb;

alter table app.variants
  add column if not exists barcode     text,
  add column if not exists weight      numeric(12,3),
  add column if not exists weight_unit text default 'g';

create table if not exists app.product_options (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  product_id  uuid not null references app.products(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  position    smallint not null default 0,
  unique (product_id, name)
);

create index if not exists product_options_product_idx on app.product_options (product_id);

create table if not exists app.product_option_values (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  option_id   uuid not null references app.product_options(id) on delete cascade,
  value       text not null check (char_length(value) between 1 and 60),
  position    smallint not null default 0,
  unique (option_id, value)
);

create index if not exists product_option_values_option_idx on app.product_option_values (option_id);

create table if not exists app.variant_option_selections (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references app.tenants(id) on delete cascade,
  variant_id      uuid not null references app.variants(id) on delete cascade,
  option_id       uuid not null references app.product_options(id) on delete cascade,
  option_value_id uuid not null references app.product_option_values(id) on delete cascade,
  unique (variant_id, option_id)
);

create index if not exists vos_variant_idx on app.variant_option_selections (variant_id);

alter table app.product_options enable row level security;
alter table app.product_option_values enable row level security;
alter table app.variant_option_selections enable row level security;

create policy product_options_all on app.product_options
  for all using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
create policy product_option_values_all on app.product_option_values
  for all using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
create policy variant_option_selections_all on app.variant_option_selections
  for all using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

-- ----------------------------------------------------------------------------
-- Purchase orders: document number
-- ----------------------------------------------------------------------------

alter table app.purchase_orders
  add column if not exists po_number text;

create unique index if not exists purchase_orders_tenant_po_number_idx
  on app.purchase_orders (tenant_id, po_number)
  where po_number is not null;

-- ----------------------------------------------------------------------------
-- Vendor bills: header + lines + receipt linkage
-- ----------------------------------------------------------------------------

alter table app.vendor_bills
  add column if not exists receipt_id uuid references app.receipts(id);

create index if not exists vendor_bills_receipt_idx on app.vendor_bills (receipt_id);

create table if not exists app.vendor_bill_lines (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references app.tenants(id) on delete cascade,
  bill_id             uuid not null references app.vendor_bills(id) on delete cascade,
  line_number         smallint not null default 1,
  variant_id          uuid references app.variants(id),
  description         text,
  qty                 numeric(12,3) not null default 1 check (qty > 0),
  unit_cost           numeric(12,2) not null default 0 check (unit_cost >= 0),
  line_amount         numeric(12,2) not null check (line_amount > 0),
  po_line_item_id     uuid references app.po_line_items(id),
  receipt_line_item_id uuid references app.receipt_line_items(id),
  expense_account_id  uuid references app.accounts(id),
  check (variant_id is not null or description is not null)
);

create index if not exists vendor_bill_lines_bill_idx on app.vendor_bill_lines (bill_id);

alter table app.vendor_bill_lines enable row level security;
create policy vendor_bill_lines_all on app.vendor_bill_lines
  for all using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

-- Backfill implicit single lines for existing bills
insert into app.vendor_bill_lines (tenant_id, bill_id, line_number, description, qty, unit_cost, line_amount, expense_account_id)
select b.tenant_id, b.id, 1, coalesce(b.memo, b.bill_number, 'Bill line'), 1, b.amount, b.amount, b.expense_account_id
  from app.vendor_bills b
 where not exists (select 1 from app.vendor_bill_lines l where l.bill_id = b.id);

-- Replace bill-insert journal trigger with line-aware posting function
drop trigger if exists vendor_bills_insert on app.vendor_bills;

create or replace function app.vendor_bills_set_defaults()
returns trigger language plpgsql security definer set search_path = app as $$
begin
  if new.expense_account_id is null then
    new.expense_account_id := app.account_id_by_code(new.tenant_id, '1200');
  end if;
  return new;
end;
$$;

create trigger vendor_bills_defaults
  before insert on app.vendor_bills
  for each row execute function app.vendor_bills_set_defaults();

-- Post journal for a bill from its line items (grouped by expense account)
create or replace function app.post_vendor_bill_journal(p_bill_id uuid)
returns void
language plpgsql security definer set search_path = app
as $$
declare
  b app.vendor_bills;
  journal_lines jsonb := '[]'::jsonb;
  acct record;
  vendor_name text;
begin
  select * into b from app.vendor_bills where id = p_bill_id;
  if b.id is null then raise exception 'bill not found'; end if;

  select name into vendor_name from app.vendors where id = b.vendor_id;

  for acct in
    select a.code, sum(l.line_amount) as amt
      from app.vendor_bill_lines l
      join app.accounts a on a.id = coalesce(l.expense_account_id, b.expense_account_id)
     where l.bill_id = b.id
     group by a.code
  loop
    journal_lines := journal_lines || jsonb_build_array(
      jsonb_build_object('account_code', acct.code, 'debit', acct.amt, 'credit', 0)
    );
  end loop;

  if jsonb_array_length(journal_lines) = 0 then
    raise exception 'bill % has no lines', p_bill_id;
  end if;

  journal_lines := journal_lines || jsonb_build_array(
    jsonb_build_object('account_code', '2000', 'debit', 0, 'credit', b.amount)
  );

  perform app.post_journal_entry(
    b.tenant_id,
    'Bill ' || coalesce(b.bill_number, left(b.id::text, 8)) || ' — ' || vendor_name,
    'inventory_ap',
    journal_lines,
    'vendor_bill', b.id
  );

  insert into app.events (tenant_id, type, payload, emitted_by)
  values (b.tenant_id, 'bill.created',
          jsonb_build_object('bill_id', b.id, 'vendor_id', b.vendor_id,
                             'amount', b.amount, 'due_date', b.due_date, 'po_id', b.po_id,
                             'receipt_id', b.receipt_id),
          auth.uid());
end;
$$;

-- Atomic bill create: header + lines + journal
create or replace function app.create_vendor_bill(
  p_tenant_id uuid,
  p_vendor_id uuid,
  p_lines jsonb,
  p_bill_number text default null,
  p_po_id uuid default null,
  p_receipt_id uuid default null,
  p_due_date date default null,
  p_memo text default null,
  p_expense_account_code text default '1200'
)
returns uuid
language plpgsql security definer set search_path = app
as $$
declare
  bill_id uuid;
  line jsonb;
  line_no smallint := 0;
  total numeric(12,2) := 0;
  line_amt numeric(12,2);
  default_expense uuid;
begin
  if not app.is_tenant_member(p_tenant_id) then
    raise exception 'not a member of tenant %', p_tenant_id;
  end if;
  if jsonb_array_length(p_lines) < 1 then
    raise exception 'at least one bill line is required';
  end if;

  default_expense := app.account_id_by_code(p_tenant_id, coalesce(p_expense_account_code, '1200'));

  for line in select * from jsonb_array_elements(p_lines) loop
    line_amt := coalesce((line->>'line_amount')::numeric(12,2),
      coalesce((line->>'qty')::numeric(12,3), 1) * coalesce((line->>'unit_cost')::numeric(12,2), 0));
    if line_amt <= 0 then raise exception 'each line must have a positive amount'; end if;
    total := total + line_amt;
  end loop;

  insert into app.vendor_bills
    (tenant_id, vendor_id, amount, bill_number, po_id, receipt_id, due_date, memo, expense_account_id, created_by)
  values (p_tenant_id, p_vendor_id, total, p_bill_number, p_po_id, p_receipt_id, p_due_date, p_memo, default_expense, auth.uid())
  returning id into bill_id;

  for line in select * from jsonb_array_elements(p_lines) loop
    line_no := line_no + 1;
    line_amt := coalesce((line->>'line_amount')::numeric(12,2),
      coalesce((line->>'qty')::numeric(12,3), 1) * coalesce((line->>'unit_cost')::numeric(12,2), 0));
    insert into app.vendor_bill_lines
      (tenant_id, bill_id, line_number, variant_id, description, qty, unit_cost, line_amount,
       po_line_item_id, receipt_line_item_id, expense_account_id)
    values (
      p_tenant_id, bill_id, line_no,
      nullif(line->>'variant_id', '')::uuid,
      nullif(line->>'description', ''),
      coalesce((line->>'qty')::numeric(12,3), 1),
      coalesce((line->>'unit_cost')::numeric(12,2), line_amt),
      line_amt,
      nullif(line->>'po_line_item_id', '')::uuid,
      nullif(line->>'receipt_line_item_id', '')::uuid,
      coalesce(app.account_id_by_code(p_tenant_id, line->>'expense_account_code'), default_expense)
    );
  end loop;

  perform app.post_vendor_bill_journal(bill_id);
  return bill_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Product create with option matrix
-- ----------------------------------------------------------------------------

create or replace function app.create_product_with_variants(
  p_tenant_id uuid,
  p_title text,
  p_description text default null,
  p_brand text default null,
  p_product_type text default null,
  p_default_vendor_id uuid default null,
  p_custom_attributes jsonb default '{}'::jsonb,
  p_options jsonb default '[]'::jsonb,
  p_variants jsonb default '[]'::jsonb
)
returns uuid
language plpgsql security definer set search_path = app
as $$
declare
  product_id uuid;
  opt jsonb;
  val text;
  opt_id uuid;
  val_id uuid;
  opt_pos smallint := 0;
  val_pos smallint;
  var jsonb;
  var_id uuid;
  sel jsonb;
  opt_name text;
begin
  if not app.is_tenant_member(p_tenant_id) then raise exception 'not a member of tenant %', p_tenant_id; end if;
  if jsonb_array_length(p_variants) < 1 then raise exception 'at least one variant is required'; end if;

  insert into app.products (tenant_id, title, description, brand, product_type, default_vendor_id, custom_attributes)
  values (p_tenant_id, p_title, p_description, p_brand, p_product_type, p_default_vendor_id, coalesce(p_custom_attributes, '{}'::jsonb))
  returning id into product_id;

  for opt in select * from jsonb_array_elements(p_options) loop
    opt_pos := opt_pos + 1;
    insert into app.product_options (tenant_id, product_id, name, position)
    values (p_tenant_id, product_id, opt->>'name', coalesce((opt->>'position')::smallint, opt_pos))
    returning id into opt_id;

    val_pos := 0;
    for val in select jsonb_array_elements_text(coalesce(opt->'values', '[]'::jsonb)) loop
      val_pos := val_pos + 1;
      insert into app.product_option_values (tenant_id, option_id, value, position)
      values (p_tenant_id, opt_id, val, val_pos);
    end loop;
  end loop;

  for var in select * from jsonb_array_elements(p_variants) loop
    insert into app.variants (tenant_id, product_id, sku, title, price, unit_cost, reorder_point, barcode, weight, weight_unit)
    values (
      p_tenant_id, product_id,
      var->>'sku',
      nullif(var->>'title', ''),
      nullif((var->>'price')::numeric(12,2), null),
      nullif((var->>'unit_cost')::numeric(12,2), null),
      nullif((var->>'reorder_point')::integer, null),
      nullif(var->>'barcode', ''),
      nullif((var->>'weight')::numeric(12,3), null),
      coalesce(nullif(var->>'weight_unit', ''), 'g')
    )
    returning id into var_id;

    if var->'option_values' is not null then
      for opt_name, sel in select * from jsonb_each(var->'option_values') loop
        select po.id, pov.id into opt_id, val_id
          from app.product_options po
          join app.product_option_values pov on pov.option_id = po.id and pov.value = sel #>> '{}'
         where po.product_id = product_id and po.name = opt_name;
        if opt_id is null then
          raise exception 'unknown option % for product', opt_name;
        end if;
        insert into app.variant_option_selections (tenant_id, variant_id, option_id, option_value_id)
        values (p_tenant_id, var_id, opt_id, val_id);
      end loop;
    end if;
  end loop;

  return product_id;
end;
$$;

-- Document chain view for drill-down / linkage UI
create or replace view app.document_chain with (security_invoker = true) as
select
  po.tenant_id,
  po.id as po_id,
  po.po_number,
  po.status as po_status,
  pli.id as po_line_id,
  pli.variant_id,
  pli.qty as po_qty,
  pli.unit_cost as po_unit_cost,
  rc.id as receipt_id,
  rli.id as receipt_line_id,
  rli.qty as received_qty,
  b.id as bill_id,
  b.bill_number,
  b.status as bill_status,
  b.amount as bill_amount,
  bl.id as bill_line_id,
  bl.line_amount as bill_line_amount,
  coalesce((
    select sum(a.amount) from app.vendor_payment_allocations a where a.bill_id = b.id
  ), 0) as bill_paid
from app.purchase_orders po
left join app.po_line_items pli on pli.po_id = po.id
left join app.receipt_line_items rli on rli.po_line_item_id = pli.id
left join app.receipts rc on rc.id = rli.receipt_id and rc.finalized_at is not null
left join app.vendor_bill_lines bl on bl.po_line_item_id = pli.id
left join app.vendor_bills b on b.id = bl.bill_id;

grant execute on function app.create_vendor_bill(uuid, uuid, jsonb, text, uuid, uuid, date, text, text) to authenticated;
grant execute on function app.create_product_with_variants(uuid, text, text, text, text, uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function app.post_vendor_bill_journal(uuid) to authenticated;
