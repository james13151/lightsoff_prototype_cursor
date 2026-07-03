#!/usr/bin/env bash
# Bootstrap a local LightsOff Postgres database for development.
# Usage:
#   sudo -u postgres bash scripts/bootstrap-db.sh          # system Postgres
#   docker compose up -d db && bash scripts/bootstrap-db.sh --docker
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$ROOT/supabase/migrations"
SHIM="$ROOT/supabase/tests/shim_auth.sql"

DB_NAME="${LIGHTSOFF_DB:-lightsoff}"
DB_USER="${LIGHTSOFF_DB_USER:-lightsoff_api}"
DB_PASS="${LIGHTSOFF_DB_PASS:-localdev}"
DOCKER_MODE=false

for arg in "$@"; do
  case "$arg" in
    --docker) DOCKER_MODE=true ;;
    --reset) RESET=true ;;
  esac
done

psql_admin() {
  if $DOCKER_MODE; then
    PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres "$@"
  else
    sudo -u postgres psql "$@"
  fi
}

echo "==> LightsOff DB bootstrap (database: $DB_NAME)"

if [ "${RESET:-}" = true ]; then
  echo "    Dropping existing database $DB_NAME"
  psql_admin -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE);" postgres 2>/dev/null || \
    psql_admin -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" postgres
fi

if ! psql_admin -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  echo "    Creating database $DB_NAME"
  psql_admin -c "CREATE DATABASE \"$DB_NAME\";"
else
  echo "    Database $DB_NAME already exists"
fi

echo "    Applying auth shim"
psql_admin -v ON_ERROR_STOP=1 -d "$DB_NAME" -f "$SHIM"

echo "    Applying migrations"
for f in "$MIGRATIONS_DIR"/*.sql; do
  echo "      $(basename "$f")"
  psql_admin -v ON_ERROR_STOP=1 -q -d "$DB_NAME" -f "$f"
done

echo "    Creating API role $DB_USER (if missing)"
psql_admin -d "$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
do \$\$
begin
  if not exists (select 1 from pg_roles where rolname = '$DB_USER') then
    create role $DB_USER login password '$DB_PASS' in role authenticated;
  end if;
end;
\$\$;
SQL

echo "    Seeding dev users (Alice + Bob)"
psql_admin -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com')
on conflict do nothing;
SQL

echo
echo "==> Done. Connection string:"
if $DOCKER_MODE; then
  echo "    DATABASE_URL=postgres://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME"
else
  echo "    DATABASE_URL=postgres://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME"
fi
echo
echo "    Dev user IDs for Connect screen:"
echo "      Alice (owner): 11111111-1111-1111-1111-111111111111"
echo "      Bob (member):  22222222-2222-2222-2222-222222222222"
