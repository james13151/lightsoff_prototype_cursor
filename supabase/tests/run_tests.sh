#!/usr/bin/env bash
# Phase 0 test runner: creates a throwaway database, applies the auth shim +
# migration as postgres, then runs the RLS suite as a restricted role.
# Usage: sudo -u postgres bash supabase/tests/run_tests.sh
set -euo pipefail

DB=lightsoff_test
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$DIR/../migrations"

dropdb --if-exists "$DB"
createdb "$DB"

psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$DIR/shim_auth.sql"

for f in "$MIGRATIONS_DIR"/*.sql; do
  echo "applying $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done

# Non-superuser test login that inherits the `authenticated` grants.
psql -v ON_ERROR_STOP=1 -q -d "$DB" <<'SQL'
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'test_user') then
    create role test_user login password 'test_user' in role authenticated;
  end if;
end;
$$;
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com')
on conflict do nothing;
SQL

PGPASSWORD=test_user psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U test_user -d "$DB" -f "$DIR/rls_isolation_test.sql"

echo "OK: Phase 0 test suite passed."
