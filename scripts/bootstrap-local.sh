#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

APP_PID=""

log() {
  echo "[bootstrap] $*"
}

fail() {
  echo "[bootstrap][error] $*" >&2
  exit 1
}

cleanup() {
  if [[ -n "${APP_PID}" ]]; then
    kill "${APP_PID}" >/dev/null 2>&1 || true
    wait "${APP_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

require_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    fail "required command not found: ${cmd}"
  fi
}

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

require_cmd node
require_cmd pnpm
require_cmd docker

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "${NODE_MAJOR}" -lt 24 ]]; then
  fail "Node.js 24+ is required (current: $(node -v))"
fi

PNPM_MAJOR="$(pnpm -v | cut -d. -f1)"
if [[ "${PNPM_MAJOR}" -lt 10 ]]; then
  fail "pnpm 10+ is required (current: $(pnpm -v))"
fi

if ! docker compose version >/dev/null 2>&1; then
  fail "docker compose is required"
fi

if [[ ! -f ".env" ]]; then
  log ".env not found. creating from .env.example"
  cp .env.example .env
fi

set -a
# shellcheck source=/dev/null
source .env
set +a

log "installing dependencies"
pnpm install --frozen-lockfile=false

log "starting local stack"
pnpm stack:up

log "running migrations"
pnpm db:migrate

log "seeding data"
pnpm db:seed

log "starting idp-server for health checks"
pnpm --filter @idp/idp-server exec tsx src/index.ts >/tmp/gxp-idp-bootstrap.log 2>&1 &
APP_PID="$!"

if ! wait_for_http "http://localhost:${PORT:-3000}/healthz" 60; then
  fail "healthz check failed (see /tmp/gxp-idp-bootstrap.log)"
fi
if ! wait_for_http "http://localhost:${PORT:-3000}/readyz" 60; then
  fail "readyz check failed (see /tmp/gxp-idp-bootstrap.log)"
fi
if ! wait_for_http "${OIDC_ISSUER:-http://localhost:3001}/.well-known/openid-configuration" 60; then
  fail "oidc discovery check failed (see /tmp/gxp-idp-bootstrap.log)"
fi

log "bootstrap completed"
echo ""
echo "Next steps:"
echo "  1) Start server: pnpm dev"
echo "  2) API health: curl http://localhost:${PORT:-3000}/healthz"
echo "  3) Test login user: user@example.com / Password123!"
echo ""
echo "Note: this script stops the temporary health-check server automatically."
