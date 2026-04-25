#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

for f in infra/migrations/*.sql; do
  echo "Applying migration: $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
