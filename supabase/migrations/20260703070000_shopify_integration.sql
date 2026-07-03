-- ============================================================================
-- LightsOff — Shopify integration (orders in, fulfillment out)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Sales orders mirrored from Shopify
-- ----------------------------------------------------------------------------

create table app.sales_orders (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references app.tenants(id) on delete cascade,
  shopify_order_id    bigint not null,
  order_number        text,
  financial_status    text,
  fulfillment_status  text,
  customer_email      text,
  customer_name       text,
  currency            text not null default 'USD',
  total_price         numeric(12,2) not null default 0,
  placed_at           timestamptz,
  cancelled_at        timestamptz,
  stock_reserved_at   timestamptz, -- when inventory ledger rows were written
  raw                 jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, shopify_order_id)
);

create index sales_orders_tenant_idx on app.sales_orders (tenant_id, placed_at desc nulls last);

create table app.sales_order_lines (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references app.tenants(id) on delete cascade,
  sales_order_id        uuid not null references app.sales_orders(id) on delete cascade,
  shopify_line_item_id  bigint not null,
  variant_id            uuid references app.variants(id),
  sku                   text,
  title                 text not null,
  qty                   integer not null check (qty > 0),
  unit_price            numeric(12,2) not null default 0,
  created_at            timestamptz not null default now(),
  unique (sales_order_id, shopify_line_item_id)
);

create index sales_order_lines_order_idx on app.sales_order_lines (sales_order_id);

alter table app.sales_orders enable row level security;
alter table app.sales_order_lines enable row level security;
create policy sales_orders_all on app.sales_orders
  for all using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
create policy sales_order_lines_all on app.sales_order_lines
  for all using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

create trigger sales_orders_touch
  before update on app.sales_orders
  for each row execute function app.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Webhook idempotency
-- ----------------------------------------------------------------------------

create table app.webhook_deliveries (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references app.tenants(id) on delete cascade,
  topic               text not null,
  shopify_webhook_id  text not null,
  processed_at        timestamptz not null default now(),
  unique (tenant_id, shopify_webhook_id)
);

alter table app.webhook_deliveries enable row level security;
create policy webhook_deliveries_select on app.webhook_deliveries
  for select using (app.is_tenant_member(tenant_id));

-- ----------------------------------------------------------------------------
-- Fulfillment extensions (link to sales order + Shopify sync state)
-- ----------------------------------------------------------------------------

alter table app.fulfillments
  add column if not exists sales_order_id uuid references app.sales_orders(id),
  add column if not exists shopify_fulfillment_id bigint,
  add column if not exists sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced', 'failed', 'not_applicable')),
  add column if not exists sync_error text,
  add column if not exists synced_at timestamptz;

create index fulfillments_sales_order_idx on app.fulfillments (sales_order_id);

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------

-- Resolve tenant from stored Shopify shop domain (webhook routing).
create function app.tenant_by_shopify_domain(shop_domain text)
returns uuid
language sql stable security definer set search_path = app, public, extensions
as $$
  select ic.tenant_id
    from app.integration_credentials ic
   where ic.provider = 'shopify'
     and lower(pgp_sym_decrypt(ic.encrypted_secret, app.encryption_key())::jsonb->>'shop')
         = lower(shop_domain)
   order by ic.updated_at desc
   limit 1;
$$;

-- Any tenant member may read integration secrets for outbound sync (not admin-only).
create function app.reveal_provider_credential(t uuid, p app.integration_provider)
returns jsonb
language plpgsql security definer set search_path = app, public, extensions
as $$
declare
  row_rec app.integration_credentials;
begin
  if not app.is_tenant_member(t) then
    raise exception 'not a member of tenant %', t;
  end if;
  select * into row_rec
    from app.integration_credentials
   where tenant_id = t and provider = p
   order by updated_at desc
   limit 1;
  if row_rec.id is null then
    raise exception 'no % credential for tenant', p;
  end if;
  return pgp_sym_decrypt(row_rec.encrypted_secret, app.encryption_key())::jsonb;
end;
$$;

-- ----------------------------------------------------------------------------
-- Ingest a Shopify order webhook payload (orders/create, orders/updated)
-- ----------------------------------------------------------------------------

create function app.ingest_shopify_order(t uuid, payload jsonb)
returns uuid
language plpgsql security definer set search_path = app
as $$
declare
  shopify_id bigint;
  order_id uuid;
  line jsonb;
  variant_rec app.variants;
  wh_id uuid;
  should_reserve boolean;
  existing_reserved timestamptz;
begin
  shopify_id := (payload->>'id')::bigint;
  if shopify_id is null then
    raise exception 'shopify order id missing from payload';
  end if;

  insert into app.sales_orders (
    tenant_id, shopify_order_id, order_number, financial_status, fulfillment_status,
    customer_email, customer_name, currency, total_price, placed_at, cancelled_at, raw
  ) values (
    t,
    shopify_id,
    coalesce(payload->>'name', payload->>'order_number'),
    payload->>'financial_status',
    payload->>'fulfillment_status',
    payload->'customer'->>'email',
    trim(coalesce(payload->'customer'->>'first_name', '') || ' ' || coalesce(payload->'customer'->>'last_name', '')),
    coalesce(payload->>'currency', 'USD'),
    coalesce((payload->>'total_price')::numeric(12,2), 0),
    coalesce((payload->>'created_at')::timestamptz, now()),
    case when payload->>'cancelled_at' is not null then (payload->>'cancelled_at')::timestamptz end,
    payload
  )
  on conflict (tenant_id, shopify_order_id) do update set
    order_number = excluded.order_number,
    financial_status = excluded.financial_status,
    fulfillment_status = excluded.fulfillment_status,
    customer_email = excluded.customer_email,
    customer_name = excluded.customer_name,
    currency = excluded.currency,
    total_price = excluded.total_price,
    cancelled_at = excluded.cancelled_at,
    raw = excluded.raw,
    updated_at = now()
  returning id into order_id;

  -- Replace line items on each update
  delete from app.sales_order_lines where sales_order_id = order_id;

  for line in select * from jsonb_array_elements(coalesce(payload->'line_items', '[]'::jsonb)) loop
    select v.* into variant_rec
      from app.variants v
     where v.tenant_id = t
       and v.shopify_variant_id = (line->>'variant_id')::bigint
     limit 1;

    insert into app.sales_order_lines (
      tenant_id, sales_order_id, shopify_line_item_id, variant_id, sku, title, qty, unit_price
    ) values (
      t,
      order_id,
      (line->>'id')::bigint,
      variant_rec.id,
      coalesce(line->>'sku', variant_rec.sku),
      coalesce(line->>'title', line->>'name', 'Line item'),
      greatest(coalesce((line->>'quantity')::integer, 1), 1),
      coalesce((line->>'price')::numeric(12,2), 0)
    );
  end loop;

  -- Ensure fulfillment shell exists
  insert into app.fulfillments (tenant_id, shopify_order_id, sales_order_id, status)
  values (t, shopify_id, order_id, 'pending')
  on conflict (tenant_id, shopify_order_id) do update set
    sales_order_id = excluded.sales_order_id,
    updated_at = now();

  select stock_reserved_at into existing_reserved from app.sales_orders where id = order_id;

  should_reserve := existing_reserved is null
    and coalesce(payload->>'financial_status', '') in ('paid', 'partially_paid', 'partially_refunded')
    and payload->>'cancelled_at' is null;

  if should_reserve then
    wh_id := app.default_warehouse_id(t);
    for line in
      select sol.* from app.sales_order_lines sol where sol.sales_order_id = order_id and sol.variant_id is not null
    loop
      insert into app.inventory_ledger_entries (
        tenant_id, variant_id, qty_delta, reason, ref_type, ref_id, warehouse_id, location
      ) values (
        t, line.variant_id, -line.qty, 'shopify_sale', 'sales_order', order_id, wh_id, 'default'
      );
    end loop;
    update app.sales_orders set stock_reserved_at = now() where id = order_id;

    perform app.emit_event(t, 'shopify.order.received',
      jsonb_build_object(
        'sales_order_id', order_id,
        'shopify_order_id', shopify_id,
        'order_number', coalesce(payload->>'name', payload->>'order_number'),
        'total', coalesce((payload->>'total_price')::numeric, 0)
      ));
  end if;

  -- Cancelled order: restore stock once
  if payload->>'cancelled_at' is not null and existing_reserved is not null then
    wh_id := app.default_warehouse_id(t);
    for line in
      select sol.* from app.sales_order_lines sol where sol.sales_order_id = order_id and sol.variant_id is not null
    loop
      if not exists (
        select 1 from app.inventory_ledger_entries ile
         where ile.tenant_id = t and ile.ref_type = 'sales_order_cancel' and ile.ref_id = order_id
           and ile.variant_id = line.variant_id
      ) then
        insert into app.inventory_ledger_entries (
          tenant_id, variant_id, qty_delta, reason, ref_type, ref_id, warehouse_id, location
        ) values (
          t, line.variant_id, line.qty, 'manual_adjustment', 'sales_order_cancel', order_id, wh_id, 'default'
        );
      end if;
    end loop;
    update app.fulfillments set status = 'cancelled', updated_at = now()
     where tenant_id = t and shopify_order_id = shopify_id;
  end if;

  return order_id;
end;
$$;

-- Record shipment locally (Shopify push happens in API worker).
create function app.mark_fulfillment_shipped(
  p_fulfillment_id uuid,
  p_carrier text,
  p_tracking text,
  p_shipped_at timestamptz default now()
)
returns app.fulfillments
language plpgsql security definer set search_path = app
as $$
declare
  f app.fulfillments;
  line record;
  wh_id uuid;
  existing_reserved timestamptz;
begin
  select * into f from app.fulfillments where id = p_fulfillment_id;
  if f.id is null or not app.is_tenant_member(f.tenant_id) then
    raise exception 'fulfillment not found';
  end if;
  if f.status = 'cancelled' then
    raise exception 'cannot ship a cancelled fulfillment';
  end if;

  update app.fulfillments set
    status = 'shipped',
    carrier = p_carrier,
    tracking_number = p_tracking,
    shipped_at = coalesce(p_shipped_at, now()),
    sync_status = 'pending',
    updated_at = now()
  where id = f.id
  returning * into f;

  wh_id := app.default_warehouse_id(f.tenant_id);
  -- Only deduct stock on ship if it wasn't already reserved at order ingest.
  if f.sales_order_id is not null then
    select stock_reserved_at into existing_reserved from app.sales_orders where id = f.sales_order_id;
  end if;

  if existing_reserved is null then
    for line in
      select sol.* from app.sales_order_lines sol
       where sol.sales_order_id = f.sales_order_id and sol.variant_id is not null
    loop
      if not exists (
        select 1 from app.inventory_ledger_entries ile
         where ile.tenant_id = f.tenant_id and ile.reason = 'fulfillment'
           and ile.ref_type = 'fulfillment' and ile.ref_id = f.id and ile.variant_id = line.variant_id
      ) then
        insert into app.inventory_ledger_entries (
          tenant_id, variant_id, qty_delta, reason, ref_type, ref_id, warehouse_id, location
        ) values (
          f.tenant_id, line.variant_id, -line.qty, 'fulfillment', 'fulfillment', f.id, wh_id, 'default'
        );
      end if;
    end loop;
  end if;

  perform app.emit_event(f.tenant_id, 'fulfillment.shipped',
    jsonb_build_object(
      'fulfillment_id', f.id,
      'shopify_order_id', f.shopify_order_id,
      'carrier', p_carrier,
      'tracking_number', p_tracking
    ));

  return f;
end;
$$;

create function app.mark_fulfillment_synced(p_fulfillment_id uuid, p_shopify_fulfillment_id bigint)
returns void
language plpgsql security definer set search_path = app
as $$
declare
  f app.fulfillments;
begin
  select * into f from app.fulfillments where id = p_fulfillment_id;
  if f.id is null or not app.is_tenant_member(f.tenant_id) then
    raise exception 'fulfillment not found';
  end if;
  update app.fulfillments set
    shopify_fulfillment_id = p_shopify_fulfillment_id,
    sync_status = 'synced',
    sync_error = null,
    synced_at = now(),
    updated_at = now()
  where id = f.id;

  perform app.emit_event(f.tenant_id, 'shopify.fulfillment.synced',
    jsonb_build_object(
      'fulfillment_id', f.id,
      'shopify_order_id', f.shopify_order_id,
      'shopify_fulfillment_id', p_shopify_fulfillment_id
    ));
end;
$$;

create function app.mark_fulfillment_sync_failed(p_fulfillment_id uuid, p_error text)
returns void
language plpgsql security definer set search_path = app
as $$
declare
  f app.fulfillments;
begin
  select * into f from app.fulfillments where id = p_fulfillment_id;
  if f.id is null or not app.is_tenant_member(f.tenant_id) then
    raise exception 'fulfillment not found';
  end if;
  update app.fulfillments set
    sync_status = 'failed',
    sync_error = left(p_error, 500),
    updated_at = now()
  where id = f.id;
end;
$$;

-- Webhook idempotency insert (security definer — no user context on webhook path).
create function app.record_webhook_delivery(t uuid, p_topic text, p_webhook_id text)
returns boolean
language plpgsql security definer set search_path = app
as $$
begin
  insert into app.webhook_deliveries (tenant_id, topic, shopify_webhook_id)
  values (t, p_topic, p_webhook_id);
  return true;
exception when unique_violation then
  return false;
end;
$$;

-- Process webhook with encryption key set on connection (called from API).
create function app.process_shopify_webhook(t uuid, p_topic text, p_webhook_id text, payload jsonb)
returns uuid
language plpgsql security definer set search_path = app
as $$
declare
  is_new boolean;
  order_id uuid;
begin
  is_new := app.record_webhook_delivery(t, p_topic, p_webhook_id);
  if not is_new then
    return null;
  end if;

  if p_topic in ('orders/create', 'orders/updated', 'orders/paid') then
    order_id := app.ingest_shopify_order(t, payload);
    return order_id;
  end if;

  if p_topic = 'orders/cancelled' then
    order_id := app.ingest_shopify_order(t, payload || jsonb_build_object('cancelled_at', coalesce(payload->>'cancelled_at', now()::text)));
    return order_id;
  end if;

  return null;
end;
$$;

grant execute on function app.tenant_by_shopify_domain(text) to authenticated;
grant execute on function app.reveal_provider_credential(uuid, app.integration_provider) to authenticated;
grant execute on function app.ingest_shopify_order(uuid, jsonb) to authenticated;
grant execute on function app.mark_fulfillment_shipped(uuid, text, text, timestamptz) to authenticated;
grant execute on function app.mark_fulfillment_synced(uuid, bigint) to authenticated;
grant execute on function app.mark_fulfillment_sync_failed(uuid, text) to authenticated;
grant execute on function app.process_shopify_webhook(uuid, text, text, jsonb) to authenticated;
