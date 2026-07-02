-- ============================================================================
-- LightsOff — Phase 0 Foundation
-- ============================================================================
-- Multi-tenant core per the roadmap (spec §8 Phase 0):
--   * tenants + memberships with roles (row-level tenant scoping, not
--     app-layer-only: every table carries tenant_id and an RLS policy)
--   * shared entities every module builds on: vendors, products/variants
--     (mirrored from Shopify by Shopify ID), tags
--   * the append-only Event bus (spec §7.1) every module publishes to
--   * tenant-scoped encrypted credential vault for external integrations
--
-- Designed to run on Supabase (auth.uid() from GoTrue JWTs) but portable to
-- any Postgres: the only external dependency is an `auth.uid()` function
-- (see supabase/tests/shim_auth.sql for the plain-Postgres shim).
-- ============================================================================

create extension if not exists pgcrypto;

create schema if not exists app;

-- ----------------------------------------------------------------------------
-- Tenancy: tenants, memberships, roles
-- ----------------------------------------------------------------------------

create type app.member_role as enum ('owner', 'admin', 'member');

create table app.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  created_at  timestamptz not null default now()
);

create table app.memberships (
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  user_id     uuid not null, -- references auth.users(id) on Supabase
  role        app.member_role not null default 'member',
  created_at  timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index memberships_user_idx on app.memberships (user_id);

-- The single source of truth for "can this user touch this tenant's rows".
-- SECURITY DEFINER so it can read memberships regardless of the caller's RLS.
create function app.is_tenant_member(t uuid)
returns boolean
language sql stable security definer set search_path = app
as $$
  select exists (
    select 1 from app.memberships
    where tenant_id = t and user_id = auth.uid()
  );
$$;

create function app.has_role(t uuid, min_role app.member_role)
returns boolean
language sql stable security definer set search_path = app
as $$
  select exists (
    select 1 from app.memberships
    where tenant_id = t
      and user_id = auth.uid()
      and case min_role
            when 'owner'  then role = 'owner'
            when 'admin'  then role in ('owner', 'admin')
            when 'member' then true
          end
  );
$$;

-- Signup flow: creates the tenant and makes the caller its owner atomically.
create function app.create_tenant(tenant_name text)
returns app.tenants
language plpgsql security definer set search_path = app
as $$
declare
  new_tenant app.tenants;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into app.tenants (name) values (tenant_name) returning * into new_tenant;
  insert into app.memberships (tenant_id, user_id, role)
  values (new_tenant.id, auth.uid(), 'owner');
  return new_tenant;
end;
$$;

alter table app.tenants enable row level security;
alter table app.memberships enable row level security;

create policy tenants_select on app.tenants
  for select using (app.is_tenant_member(id));
create policy tenants_update on app.tenants
  for update using (app.has_role(id, 'owner'));

create policy memberships_select on app.memberships
  for select using (app.is_tenant_member(tenant_id));
-- Only admins/owners manage members; owners are created via create_tenant().
create policy memberships_insert on app.memberships
  for insert with check (app.has_role(tenant_id, 'admin') and role <> 'owner');
create policy memberships_update on app.memberships
  for update using (app.has_role(tenant_id, 'admin'));
create policy memberships_delete on app.memberships
  for delete using (app.has_role(tenant_id, 'admin') or user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Event bus (spec §7.1) — append-only, tenant-scoped
-- ----------------------------------------------------------------------------
-- Every module publishes here (inventory.received, bill.paid,
-- campaign.oos_paused, ticket.created, ...). The daily digest and all
-- cross-module automation subscribe to this table. Finalize event types
-- before Phase 1 (spec §9) — the `type` format is enforced below.

create table app.events (
  seq         bigint generated always as identity primary key,
  id          uuid not null default gen_random_uuid() unique,
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  type        text not null check (type ~ '^[a-z_]+\.[a-z_]+$'), -- module.event
  version     smallint not null default 1,
  payload     jsonb not null default '{}'::jsonb,
  emitted_by  uuid, -- user who triggered it; null for system/automation
  created_at  timestamptz not null default now()
);

create index events_tenant_seq_idx on app.events (tenant_id, seq);
create index events_tenant_type_idx on app.events (tenant_id, type);

alter table app.events enable row level security;

create policy events_select on app.events
  for select using (app.is_tenant_member(tenant_id));
create policy events_insert on app.events
  for insert with check (app.is_tenant_member(tenant_id));
-- No update/delete policies: RLS denies both for regular users.

-- Defense in depth: the bus is append-only even for the service role
-- (which bypasses RLS).
create function app.events_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'events are append-only';
end;
$$;

create trigger events_no_update_delete
  before update or delete on app.events
  for each row execute function app.events_immutable();

-- Convenience emitter used by module code and triggers.
create function app.emit_event(t uuid, event_type text, event_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql security definer set search_path = app
as $$
declare
  event_id uuid;
begin
  if not app.is_tenant_member(t) then
    raise exception 'not a member of tenant %', t;
  end if;
  insert into app.events (tenant_id, type, payload, emitted_by)
  values (t, event_type, event_payload, auth.uid())
  returning id into event_id;
  return event_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Shared entities (spec §7.1): vendors, products/variants, tags
-- ----------------------------------------------------------------------------

create table app.vendors (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references app.tenants(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 200),
  contact_email   text,
  phone           text,
  lead_time_days  integer check (lead_time_days >= 0),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index vendors_tenant_idx on app.vendors (tenant_id);
create unique index vendors_tenant_name_idx on app.vendors (tenant_id, lower(name));

-- Products/variants are mirrored from Shopify by Shopify ID (spec §7.1).
-- LightsOff is system of record for *stock*; Shopify remains system of
-- record for the catalog itself, hence the mirror columns.
create table app.products (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references app.tenants(id) on delete cascade,
  shopify_product_id  bigint,
  title               text not null,
  status              text not null default 'active' check (status in ('active', 'draft', 'archived')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, shopify_product_id)
);

create index products_tenant_idx on app.products (tenant_id);

create table app.variants (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references app.tenants(id) on delete cascade,
  product_id            uuid not null references app.products(id) on delete cascade,
  shopify_variant_id    bigint,
  shopify_inventory_item_id bigint, -- needed for inventoryAdjustQuantities write-back
  sku                   text not null,
  title                 text,
  price                 numeric(12,2),
  unit_cost             numeric(12,2),
  reorder_point         integer check (reorder_point >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (tenant_id, shopify_variant_id),
  unique (tenant_id, sku)
);

create index variants_tenant_idx on app.variants (tenant_id);
create index variants_product_idx on app.variants (product_id);

create table app.tags (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references app.tenants(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  created_at  timestamptz not null default now(),
  unique (tenant_id, name)
);

-- Polymorphic join: a tag can attach to any object in any module (the same
-- pattern Internal Collab's TicketLink will use in Phase 3).
create table app.taggings (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references app.tenants(id) on delete cascade,
  tag_id        uuid not null references app.tags(id) on delete cascade,
  taggable_type text not null check (taggable_type ~ '^[a-z_]+$'),
  taggable_id   uuid not null,
  created_at    timestamptz not null default now(),
  unique (tag_id, taggable_type, taggable_id)
);

create index taggings_tenant_target_idx on app.taggings (tenant_id, taggable_type, taggable_id);

-- updated_at maintenance
create function app.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger vendors_touch  before update on app.vendors  for each row execute function app.touch_updated_at();
create trigger products_touch before update on app.products for each row execute function app.touch_updated_at();
create trigger variants_touch before update on app.variants for each row execute function app.touch_updated_at();

-- Exemplar of "every write publishes to the bus": vendor lifecycle events.
-- Module tables in Phase 1+ follow this same pattern.
create function app.vendors_emit_event()
returns trigger language plpgsql security definer set search_path = app as $$
begin
  insert into app.events (tenant_id, type, payload, emitted_by)
  values (
    coalesce(new.tenant_id, old.tenant_id),
    'vendor.' || case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
    jsonb_build_object('vendor_id', coalesce(new.id, old.id), 'name', coalesce(new.name, old.name)),
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

create trigger vendors_event
  after insert or update or delete on app.vendors
  for each row execute function app.vendors_emit_event();

-- Standard tenant-scoped RLS for all shared entities.
alter table app.vendors  enable row level security;
alter table app.products enable row level security;
alter table app.variants enable row level security;
alter table app.tags     enable row level security;
alter table app.taggings enable row level security;

create policy vendors_all on app.vendors
  for all using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
create policy products_all on app.products
  for all using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
create policy variants_all on app.variants
  for all using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
create policy tags_all on app.tags
  for all using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
create policy taggings_all on app.taggings
  for all using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

-- ----------------------------------------------------------------------------
-- Integration credential vault (spec §8 Phase 0, §9)
-- ----------------------------------------------------------------------------
-- Tenant-scoped encrypted storage for Shopify/Meta/WhatsApp/SMTP/ads tokens.
-- Secrets are encrypted with pgcrypto using a key that ONLY the backend
-- service provides per-connection (set_config('app.encryption_key', ...)).
-- Members can list credential metadata; the plaintext is only reachable
-- through reveal_credential() on a connection that holds the key — a browser
-- talking to PostgREST/Supabase directly never can.
-- On managed Supabase you may later swap the crypto for Supabase Vault;
-- the table shape and function contracts stay the same.

create type app.integration_provider as enum
  ('shopify', 'meta', 'whatsapp', 'google_ads', 'smtp', 'other');

create table app.integration_credentials (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references app.tenants(id) on delete cascade,
  provider          app.integration_provider not null,
  label             text not null check (char_length(label) between 1 and 120),
  encrypted_secret  bytea not null,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, provider, label)
);

create index integration_credentials_tenant_idx on app.integration_credentials (tenant_id);

create trigger integration_credentials_touch
  before update on app.integration_credentials
  for each row execute function app.touch_updated_at();

alter table app.integration_credentials enable row level security;

-- Metadata is visible to members; direct INSERT/UPDATE of ciphertext is not
-- allowed — writes go through store_credential() so encryption is uniform.
create policy credentials_select on app.integration_credentials
  for select using (app.is_tenant_member(tenant_id));
create policy credentials_delete on app.integration_credentials
  for delete using (app.has_role(tenant_id, 'admin'));

create function app.encryption_key()
returns text language plpgsql stable as $$
declare
  key text;
begin
  key := current_setting('app.encryption_key', true);
  if key is null or key = '' then
    raise exception 'encryption key not configured on this connection';
  end if;
  return key;
end;
$$;

create function app.store_credential(
  t uuid,
  p app.integration_provider,
  credential_label text,
  secret jsonb
-- search_path includes public and extensions so pgcrypto resolves both on
-- plain Postgres (public) and on Supabase (extensions); missing schemas in
-- a search_path are ignored.
) returns uuid
language plpgsql security definer set search_path = app, public, extensions
as $$
declare
  cred_id uuid;
begin
  if not app.has_role(t, 'admin') then
    raise exception 'admin role required to store credentials';
  end if;
  insert into app.integration_credentials (tenant_id, provider, label, encrypted_secret, created_by)
  values (t, p, credential_label, pgp_sym_encrypt(secret::text, app.encryption_key()), auth.uid())
  on conflict (tenant_id, provider, label)
  do update set encrypted_secret = excluded.encrypted_secret, created_by = excluded.created_by
  returning id into cred_id;

  perform app.emit_event(t, 'integration.credential_stored',
    jsonb_build_object('credential_id', cred_id, 'provider', p, 'label', credential_label));
  return cred_id;
end;
$$;

create function app.reveal_credential(cred_id uuid)
returns jsonb
language plpgsql security definer set search_path = app, public, extensions
as $$
declare
  row_rec app.integration_credentials;
begin
  select * into row_rec from app.integration_credentials where id = cred_id;
  if row_rec.id is null or not app.has_role(row_rec.tenant_id, 'admin') then
    raise exception 'credential not found';
  end if;
  return pgp_sym_decrypt(row_rec.encrypted_secret, app.encryption_key())::jsonb;
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
-- `authenticated` is the role API connections use (Supabase defines it;
-- plain Postgres gets it from the shim/bootstrap). RLS does the real work —
-- grants just open the door to the schema.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end;
$$;

grant usage on schema app to authenticated;
grant select, insert, update, delete on all tables in schema app to authenticated;
grant usage on all sequences in schema app to authenticated;
revoke update, delete on app.events from authenticated;
revoke insert, update on app.integration_credentials from authenticated;
grant execute on all functions in schema app to authenticated;
