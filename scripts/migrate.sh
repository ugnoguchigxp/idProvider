#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ -f ".env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source ".env"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

run_migration_with_docker_compose() {
  local file="$1"
  docker compose -f infra/docker-compose.yml exec -T postgres \
    psql -U postgres -d idp -v ON_ERROR_STOP=1 -f - < "${file}"
}

for f in infra/migrations/*.sql; do
  echo "Applying migration: $f"
  if command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
  else
    run_migration_with_docker_compose "$f"
  fi
done
