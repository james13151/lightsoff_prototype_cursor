#!/usr/bin/env bash
# Start local Postgres (Docker) + bootstrap schema + print next steps.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Starting Postgres (Docker)"
docker compose -f "$ROOT/docker-compose.yml" up -d db

echo "==> Waiting for Postgres"
for i in $(seq 1 30); do
  if docker compose -f "$ROOT/docker-compose.yml" exec -T db pg_isready -U postgres -d lightsoff >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> Bootstrapping schema"
bash "$ROOT/scripts/bootstrap-db.sh" --docker

if [ ! -f "$ROOT/api/.env" ]; then
  echo "==> Creating api/.env from template"
  JWT_SECRET="local-dev-jwt-$(openssl rand -hex 16 2>/dev/null || echo secret)"
  ENC_KEY="local-dev-enc-$(openssl rand -hex 16 2>/dev/null || echo key)"
  cat > "$ROOT/api/.env" <<EOF
DATABASE_URL=postgres://lightsoff_api:localdev@127.0.0.1:5432/lightsoff
JWT_SECRET=$JWT_SECRET
APP_ENCRYPTION_KEY=$ENC_KEY
ALLOW_DEV_AUTH=true
PORT=3001
EOF
fi

echo
echo "==> Ready! Start the stack:"
echo "    Terminal 1:  cd api && npm install && npm run dev"
echo "    Terminal 2:  cd lightsoff && npm install && npm run dev"
echo "    Browser:     http://localhost:5173  →  Connect screen"
echo "    Dev user:    11111111-1111-1111-1111-111111111111 (Alice)"
