#!/usr/bin/env bash
# Apply LightsOff migrations to a linked Supabase project.
#
# Prerequisites:
#   npm install -g supabase   (or use npx supabase)
#   supabase login
#   supabase link --project-ref <your-project-ref>
#
# Usage:
#   bash scripts/supabase-setup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI not found. Install: https://supabase.com/docs/guides/cli"
  echo
  echo "Manual alternative — paste each file into Supabase → SQL editor (in order):"
  for f in "$ROOT/supabase/migrations"/*.sql; do
    echo "  $(basename "$f")"
  done
  echo
  echo "Then run: supabase/setup-api-role.sql"
  exit 1
fi

echo "==> Pushing migrations to linked Supabase project"
supabase db push

echo
echo "==> Next steps"
echo "  1. Supabase → SQL editor → run supabase/setup-api-role.sql (set a strong password)"
echo "  2. Supabase → Settings → API — copy Project URL, anon key, and JWT secret"
echo "  3. Deploy api/ to a Node host (see docs/DEPLOY.md)"
echo "  4. GitHub repo → Settings → Secrets → Actions — set:"
echo "       VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL"
echo "  5. Re-run the Deploy to GitHub Pages workflow"
