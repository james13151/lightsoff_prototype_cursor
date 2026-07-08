-- ============================================================================
-- Shopify OAuth metadata + inventory writeback support
-- ============================================================================

alter table app.warehouses
  add column if not exists shopify_location_id bigint;

create table if not exists app.shopify_inventory_pushes (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references app.tenants(id) on delete cascade,
  variant_id            uuid not null references app.variants(id),
  shopify_inventory_item_id bigint not null,
  shopify_location_id   bigint not null,
  qty_delta             integer not null,
  reason                text not null,
  ref_type              text,
  ref_id                uuid,
  status                text not null default 'pending' check (status in ('pending', 'synced', 'failed', 'skipped')),
  error                 text,
  created_at            timestamptz not null default now()
);

create index if not exists shopify_inventory_pushes_tenant_idx
  on app.shopify_inventory_pushes (tenant_id, created_at desc);

alter table app.shopify_inventory_pushes enable row level security;
create policy shopify_inventory_pushes_select on app.shopify_inventory_pushes
  for select using (app.is_tenant_member(tenant_id));

create function app.record_shopify_inventory_push(
  t uuid,
  p_variant_id uuid,
  p_inventory_item_id bigint,
  p_location_id bigint,
  p_qty_delta integer,
  p_reason text,
  p_ref_type text default null,
  p_ref_id uuid default null,
  p_status text default 'synced',
  p_error text default null
)
returns uuid
language plpgsql security definer set search_path = app
as $$
declare
  push_id uuid;
begin
  insert into app.shopify_inventory_pushes (
    tenant_id, variant_id, shopify_inventory_item_id, shopify_location_id,
    qty_delta, reason, ref_type, ref_id, status, error
  ) values (
    t, p_variant_id, p_inventory_item_id, p_location_id,
    p_qty_delta, p_reason, p_ref_type, p_ref_id, p_status, p_error
  ) returning id into push_id;

  if p_status = 'synced' then
    perform app.emit_event(t, 'shopify.inventory.pushed',
      jsonb_build_object(
        'push_id', push_id,
        'variant_id', p_variant_id,
        'qty_delta', p_qty_delta,
        'reason', p_reason
      ));
  end if;

  return push_id;
end;
$$;

grant execute on function app.record_shopify_inventory_push(uuid, uuid, bigint, bigint, integer, text, text, uuid, text, text) to authenticated;
