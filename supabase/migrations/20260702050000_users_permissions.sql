-- ============================================================================
-- LightsOff — User profiles + membership management helpers
-- ============================================================================

create table if not exists app.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  display_name  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table app.profiles enable row level security;

create policy profiles_select on app.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from app.memberships m1
      join app.memberships m2 on m2.tenant_id = m1.tenant_id
      where m1.user_id = auth.uid() and m2.user_id = profiles.id
    )
  );

create policy profiles_upsert_self on app.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create or replace function app.upsert_profile(
  p_user_id uuid,
  p_email text default null,
  p_display_name text default null
)
returns app.profiles
language plpgsql security definer set search_path = app, auth
as $$
declare
  p app.profiles;
begin
  insert into app.profiles (id, email, display_name)
  values (p_user_id, p_email, p_display_name)
  on conflict (id) do update set
    email = coalesce(excluded.email, app.profiles.email),
    display_name = coalesce(excluded.display_name, app.profiles.display_name),
    updated_at = now()
  returning * into p;
  return p;
end;
$$;

-- Extend create_tenant to seed owner profile
create or replace function app.create_tenant(tenant_name text)
returns app.tenants
language plpgsql security definer set search_path = app, auth
as $$
declare
  new_tenant app.tenants;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  perform app.upsert_profile(auth.uid(), null, null);
  insert into app.tenants (name) values (tenant_name) returning * into new_tenant;
  insert into app.memberships (tenant_id, user_id, role)
  values (new_tenant.id, auth.uid(), 'owner');
  return new_tenant;
end;
$$;

create or replace function app.add_tenant_member(
  p_tenant_id uuid,
  p_user_id uuid,
  p_role app.member_role,
  p_email text default null,
  p_display_name text default null
)
returns app.memberships
language plpgsql security definer set search_path = app, auth
as $$
declare
  m app.memberships;
begin
  if not app.has_role(p_tenant_id, 'admin') then
    raise exception 'admin role required';
  end if;
  if p_role = 'owner' then
    raise exception 'cannot assign owner role via invite';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'user not found';
  end if;
  perform app.upsert_profile(p_user_id, p_email, p_display_name);
  insert into app.memberships (tenant_id, user_id, role)
  values (p_tenant_id, p_user_id, p_role)
  on conflict (tenant_id, user_id) do update set role = excluded.role
  returning * into m;
  return m;
end;
$$;

create or replace function app.update_member_role(
  p_tenant_id uuid,
  p_user_id uuid,
  p_role app.member_role
)
returns app.memberships
language plpgsql security definer set search_path = app
as $$
declare
  m app.memberships;
  current_role app.member_role;
begin
  if not app.has_role(p_tenant_id, 'admin') then
    raise exception 'admin role required';
  end if;
  select role into current_role from app.memberships
   where tenant_id = p_tenant_id and user_id = p_user_id;
  if current_role is null then
    raise exception 'member not found';
  end if;
  if current_role = 'owner' then
    raise exception 'cannot change owner role';
  end if;
  if p_role = 'owner' then
    raise exception 'cannot promote to owner';
  end if;
  update app.memberships set role = p_role
   where tenant_id = p_tenant_id and user_id = p_user_id
  returning * into m;
  return m;
end;
$$;

create or replace function app.remove_tenant_member(p_tenant_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = app
as $$
declare
  current_role app.member_role;
begin
  select role into current_role from app.memberships
   where tenant_id = p_tenant_id and user_id = p_user_id;
  if current_role is null then
    raise exception 'member not found';
  end if;
  if current_role = 'owner' then
    raise exception 'cannot remove workspace owner';
  end if;
  if not (app.has_role(p_tenant_id, 'admin') or p_user_id = auth.uid()) then
    raise exception 'admin role required';
  end if;
  delete from app.memberships where tenant_id = p_tenant_id and user_id = p_user_id;
end;
$$;

create or replace view app.tenant_members with (security_invoker = true) as
select
  m.tenant_id,
  m.user_id,
  m.role,
  m.created_at as joined_at,
  coalesce(p.display_name, split_part(p.email, '@', 1), left(m.user_id::text, 8)) as display_name,
  p.email
from app.memberships m
left join app.profiles p on p.id = m.user_id;

grant select on app.tenant_members to authenticated;
grant execute on function app.upsert_profile(uuid, text, text) to authenticated;
grant execute on function app.add_tenant_member(uuid, uuid, app.member_role, text, text) to authenticated;
grant execute on function app.update_member_role(uuid, uuid, app.member_role) to authenticated;
grant execute on function app.remove_tenant_member(uuid, uuid) to authenticated;
