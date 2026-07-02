-- ============================================================================
-- Phase 0 RLS + event-bus test suite
-- Run as a NON-superuser with role `authenticated` (superusers bypass RLS).
-- The runner (run_tests.sh) creates the auth users as postgres first, then
-- executes this file as the restricted role. Any failed assertion aborts
-- the script with an exception.
-- ============================================================================

\set ON_ERROR_STOP on

\set alice '11111111-1111-1111-1111-111111111111'
\set bob   '22222222-2222-2222-2222-222222222222'

-- DO blocks can't read psql variables, so shared test context lives here.
create temp table test_ctx (
  alice_tid uuid,
  bob_tid   uuid,
  cred_id   uuid
);
insert into test_ctx default values;

-- ---------------------------------------------------------------------------
-- Alice creates her tenant and data
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :'alice')::text, false);

select app.create_tenant('Alice Apparel');
update test_ctx set alice_tid = (select id from app.tenants where name = 'Alice Apparel');

insert into app.vendors (tenant_id, name, lead_time_days)
select alice_tid, 'Acme Textiles', 12 from test_ctx;

insert into app.products (tenant_id, shopify_product_id, title)
select alice_tid, 1001, 'Blue Hoodie' from test_ctx;

insert into app.variants (tenant_id, product_id, shopify_variant_id, sku, price, reorder_point)
select c.alice_tid, p.id, 5001, 'HOOD-BLU-M', 68.00, 20
from test_ctx c join app.products p on p.tenant_id = c.alice_tid;

select app.emit_event((select alice_tid from test_ctx), 'inventory.received', '{"qty": 50}'::jsonb);

do $$
begin
  -- expects: vendor.inserted trigger event + the explicit inventory.received
  if (select count(*) from app.events) < 2 then
    raise exception 'ASSERT FAILED: alice should see her events, saw %',
      (select count(*) from app.events);
  end if;
  if (select count(*) from app.vendors) <> 1 then
    raise exception 'ASSERT FAILED: alice should see exactly her 1 vendor';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bob creates his own tenant; must see NONE of Alice's rows
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :'bob')::text, false);

select app.create_tenant('Bob Brands');
update test_ctx set bob_tid = (select id from app.tenants where name = 'Bob Brands');

do $$
begin
  if (select count(*) from app.tenants) <> 1 then
    raise exception 'ASSERT FAILED: bob sees % tenants, expected only his own',
      (select count(*) from app.tenants);
  end if;
  if (select count(*) from app.vendors) <> 0 then
    raise exception 'ASSERT FAILED: bob can see another tenant''s vendors';
  end if;
  if (select count(*) from app.products) <> 0 then
    raise exception 'ASSERT FAILED: bob can see another tenant''s products';
  end if;
  if (select count(*) from app.variants) <> 0 then
    raise exception 'ASSERT FAILED: bob can see another tenant''s variants';
  end if;
  if (select count(*) from app.events) <> 0 then
    raise exception 'ASSERT FAILED: bob can see another tenant''s events';
  end if;
end;
$$;

-- Bob cannot write into Alice's tenant (RLS with-check).
do $$
declare
  target uuid := (select alice_tid from test_ctx);
begin
  begin
    insert into app.vendors (tenant_id, name) values (target, 'Sneaky Vendor');
    raise exception 'ASSERT FAILED: bob inserted into alice''s tenant';
  exception
    when insufficient_privilege then null; -- expected: RLS violation
    when others then
      if sqlerrm like 'ASSERT FAILED%' then raise; end if;
  end;
end;
$$;

-- Bob cannot emit events into Alice's tenant.
do $$
declare
  target uuid := (select alice_tid from test_ctx);
begin
  begin
    perform app.emit_event(target, 'inventory.received', '{}'::jsonb);
    raise exception 'ASSERT FAILED: bob emitted an event into alice''s tenant';
  exception
    when others then
      if sqlerrm like 'ASSERT FAILED%' then raise; end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Event bus is append-only, even for a member of the tenant
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', :'alice')::text, false);

do $$
begin
  begin
    update app.events set payload = '{"tampered": true}'::jsonb;
    raise exception 'ASSERT FAILED: events were updatable';
  exception
    when insufficient_privilege then null; -- expected: grant revoked
    when others then
      if sqlerrm like 'ASSERT FAILED%' then raise; end if;
  end;
  begin
    delete from app.events;
    raise exception 'ASSERT FAILED: events were deletable';
  exception
    when insufficient_privilege then null; -- expected
    when others then
      if sqlerrm like 'ASSERT FAILED%' then raise; end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Credential vault: encryption, tenant scoping, key gating
-- ---------------------------------------------------------------------------
select set_config('app.encryption_key', 'test-key-not-for-production', false);

update test_ctx set cred_id = app.store_credential(
  (select alice_tid from test_ctx),
  'shopify',
  'main-store',
  '{"access_token": "shpat_secret_value", "shop": "solo-brand.myshopify.com"}'::jsonb
);

do $$
declare
  cred uuid := (select cred_id from test_ctx);
  revealed jsonb;
begin
  revealed := app.reveal_credential(cred);
  if revealed ->> 'access_token' <> 'shpat_secret_value' then
    raise exception 'ASSERT FAILED: decrypted credential mismatch';
  end if;
  -- ciphertext must not contain the plaintext
  if exists (
    select 1 from app.integration_credentials
    where position('shpat_secret_value' in encode(encrypted_secret, 'escape')) > 0
  ) then
    raise exception 'ASSERT FAILED: credential stored in plaintext';
  end if;
end;
$$;

-- Without the key on the connection, reveal must fail even for the owner.
select set_config('app.encryption_key', '', false);
do $$
declare
  cred uuid := (select cred_id from test_ctx);
begin
  begin
    perform app.reveal_credential(cred);
    raise exception 'ASSERT FAILED: credential revealed without encryption key';
  exception
    when others then
      if sqlerrm like 'ASSERT FAILED%' then raise; end if;
  end;
end;
$$;

-- Bob (different tenant) cannot see or reveal Alice's credentials.
select set_config('request.jwt.claims', json_build_object('sub', :'bob')::text, false);
select set_config('app.encryption_key', 'test-key-not-for-production', false);
do $$
declare
  cred uuid := (select cred_id from test_ctx);
begin
  if (select count(*) from app.integration_credentials) <> 0 then
    raise exception 'ASSERT FAILED: bob sees another tenant''s credentials';
  end if;
  begin
    perform app.reveal_credential(cred);
    raise exception 'ASSERT FAILED: bob revealed alice''s credential';
  exception
    when others then
      if sqlerrm like 'ASSERT FAILED%' then raise; end if;
  end;
end;
$$;

select 'ALL RLS TESTS PASSED' as result;
