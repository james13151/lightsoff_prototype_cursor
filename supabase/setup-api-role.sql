-- Run once in the Supabase SQL editor (as postgres) after migrations are applied.
-- Creates the dedicated API login that inherits the `authenticated` role grants.
-- Replace the password before running in production.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'lightsoff_api') then
    create role lightsoff_api login password 'CHANGE_ME_STRONG_PASSWORD' in role authenticated;
  end if;
end;
$$;

-- Verify: lightsoff_api should appear under Roles in the dashboard.
-- Use the Supabase pooler connection string with this role for DATABASE_URL on the API host:
--   postgres://lightsoff_api.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
