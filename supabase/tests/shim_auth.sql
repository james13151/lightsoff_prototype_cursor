-- Shim so the Supabase-targeted migration runs on plain Postgres (local dev/CI).
-- Recreates the two things the migration relies on from the Supabase platform:
--   * auth.users table
--   * auth.uid() reading the `sub` claim from request.jwt.claims,
--     exactly how Supabase/PostgREST populate it per request.

create schema if not exists auth;

create table if not exists auth.users (
  id          uuid primary key default gen_random_uuid(),
  email       text unique,
  created_at  timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
$$;

grant usage on schema auth to public;
