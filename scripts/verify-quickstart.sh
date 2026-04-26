#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

APP_PID=""

step() {
  echo "[quickstart][step] $*"
}

cleanup() {
  if [[ -n "${APP_PID}" ]]; then
    kill "${APP_PID}" >/dev/null 2>&1 || true
    wait "${APP_PID}" >/dev/null 2>&1 || true
  fi
  if [[ "${QUICKSTART_KEEP_STACK:-false}" != "true" ]]; then
    pnpm stack:down >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

wait_for_http() {
  local url="$1"
  local timeout="${2:-60}"
  for _ in $(seq 1 "${timeout}"); do
    if node -e 'fetch(process.argv[1]).then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' "${url}"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

step "ensure .env"
if [[ ! -f ".env" ]]; then
  cp .env.example .env
fi
set -a
# shellcheck source=/dev/null
source .env
set +a

step "install dependencies"
pnpm install --frozen-lockfile=false

step "start local stack"
pnpm stack:up

step "run migrations"
pnpm db:migrate

step "seed data"
pnpm db:seed

step "start idp-server"
pnpm --filter @idp/idp-server exec tsx src/index.ts >/tmp/gxp-idp-quickstart.log 2>&1 &
APP_PID="$!"

step "wait for health endpoints"
wait_for_http "http://localhost:${PORT:-3000}/healthz" 90
wait_for_http "http://localhost:${PORT:-3000}/readyz" 90
wait_for_http "${OIDC_ISSUER:-http://localhost:3001}/.well-known/openid-configuration" 90

step "run synthetic login check"
SYNTHETIC_BASE_URL="http://localhost:${PORT:-3000}" \
SYNTHETIC_LOGIN_EMAIL="user@example.com" \
SYNTHETIC_LOGIN_PASSWORD="Gxp#Idp!2026$Secure" \
pnpm --filter @idp/idp-server synthetic:check

step "quickstart verification completed"
