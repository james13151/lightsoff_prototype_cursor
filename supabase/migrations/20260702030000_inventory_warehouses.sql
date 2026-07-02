-- ============================================================================
-- LightsOff — Multi-warehouse / location tracking
-- ============================================================================

create table if not exists app.warehouses (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  code        text not null check (char_length(code) between 1 and 20),
  name        text not null,
  is_default  boolean not null default false,
  address     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (tenant_id, code)
);

create index if not exists warehouses_tenant_idx on app.warehouses (tenant_id);

alter table app.warehouses enable row level security;
create policy warehouses_all on app.warehouses
  for all using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

-- One default warehouse per tenant
create unique index warehouses_tenant_default_idx on app.warehouses (tenant_id) where is_default;

create function app.default_warehouse_id(p_tenant_id uuid)
returns uuid language sql stable security definer set search_path = app as $$
  select id from app.warehouses where tenant_id = p_tenant_id and is_default limit 1;
$$;

create function app.seed_default_warehouse()
returns trigger language plpgsql security definer set search_path = app as $$
begin
  insert into app.warehouses (tenant_id, code, name, is_default)
  values (new.id, 'MAIN', 'Main warehouse', true);
  return new;
end;
$$;

create trigger tenants_seed_warehouse
  after insert on app.tenants
  for each row execute function app.seed_default_warehouse();

-- Backfill warehouses for existing tenants
insert into app.warehouses (tenant_id, code, name, is_default)
select t.id, 'MAIN', 'Main warehouse', true
  from app.tenants t
 where not exists (select 1 from app.warehouses w where w.tenant_id = t.id);

alter table app.inventory_ledger_entries
  add column if not exists warehouse_id uuid references app.warehouses(id);

update app.inventory_ledger_entries ile
   set warehouse_id = w.id
  from app.warehouses w
 where w.tenant_id = ile.tenant_id and w.is_default
   and ile.warehouse_id is null;

alter table app.receipts
  add column if not exists warehouse_id uuid references app.warehouses(id);

-- Receipts finalize into a specific warehouse
create or replace function app.finalize_receipt(p_receipt_id uuid)
returns void
language plpgsql security definer set search_path = app
as $$
declare
  r app.receipts;
  line record;
  po_line record;
  any_outstanding boolean;
  wh_id uuid;
begin
  select * into r from app.receipts where id = p_receipt_id;
  if r.id is null or not app.is_tenant_member(r.tenant_id) then
    raise exception 'receipt not found';
  end if;
  if r.finalized_at is not null then
    raise exception 'receipt already finalized';
  end if;

  wh_id := coalesce(r.warehouse_id, app.default_warehouse_id(r.tenant_id));
  if wh_id is null then raise exception 'no warehouse for tenant'; end if;

  update app.receipts set finalized_at = now(), warehouse_id = wh_id where id = r.id;

  for line in
    select * from app.receipt_line_items where receipt_id = r.id and variant_id is not null
  loop
    insert into app.inventory_ledger_entries (tenant_id, variant_id, qty_delta, reason, ref_type, ref_id, warehouse_id, location)
    values (r.tenant_id, line.variant_id, line.qty,
            case when r.type = 'sample' then 'sample_receipt'::app.ledger_reason
                 else 'po_receipt'::app.ledger_reason end,
            'receipt', r.id, wh_id,
            (select code from app.warehouses where id = wh_id));
  end loop;

  insert into app.events (tenant_id, type, payload, emitted_by)
  values (r.tenant_id, 'inventory.received',
          jsonb_build_object('receipt_id', r.id, 'po_id', r.po_id, 'receipt_type', r.type, 'warehouse_id', wh_id),
          auth.uid());

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
      if po_line.received_total < po_line.ordered then any_outstanding := true; end if;
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
     where id = r.po_id and status in ('sent', 'partially_received', 'draft');
  end if;
end;
$$;

create or replace view app.stock_by_warehouse with (security_invoker = true) as
select
  v.tenant_id,
  w.id as warehouse_id,
  w.code as warehouse_code,
  w.name as warehouse_name,
  w.is_default,
  v.id as variant_id,
  v.sku,
  v.reorder_point,
  coalesce(sum(ile.qty_delta), 0)::integer as on_hand
from app.variants v
join app.warehouses w on w.tenant_id = v.tenant_id
left join app.inventory_ledger_entries ile
  on ile.variant_id = v.id and ile.warehouse_id = w.id
group by v.tenant_id, w.id, w.code, w.name, w.is_default, v.id, v.sku, v.reorder_point;

create or replace view app.current_stock with (security_invoker = true) as
select
  tenant_id,
  variant_id,
  sku,
  reorder_point,
  sum(on_hand)::integer as on_hand
from app.stock_by_warehouse
group by tenant_id, variant_id, sku, reorder_point;

grant execute on function app.default_warehouse_id(uuid) to authenticated;
grant select on app.stock_by_warehouse, app.warehouses to authenticated;
