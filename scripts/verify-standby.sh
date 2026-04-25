#!/usr/bin/env bash
set -euo pipefail

HEALTHCHECK_URL="${STANDBY_HEALTHCHECK_URL:-}"
if [ -z "${HEALTHCHECK_URL}" ]; then
  echo "STANDBY_HEALTHCHECK_URL is required." >&2
  exit 1
fi

BASE_URL="${STANDBY_BASE_URL:-}"
if [ -z "${BASE_URL}" ]; then
  if [[ "${HEALTHCHECK_URL}" == */healthz ]]; then
    BASE_URL="${HEALTHCHECK_URL%/healthz}"
  else
    echo "STANDBY_BASE_URL is required when STANDBY_HEALTHCHECK_URL does not end with /healthz." >&2
    exit 1
  fi
fi

for attempt in $(seq 1 20); do
  if curl --fail --silent --show-error --connect-timeout 2 --max-time 5 "${HEALTHCHECK_URL}" >/dev/null; then
    echo "Standby health check passed."
    break
  fi
  sleep 3
  if [ "$attempt" -eq 20 ]; then
    echo "Standby health check failed after retries." >&2
    exit 1
  fi
done

login_email="${SMOKE_LOGIN_EMAIL:-smoke-user@example.com}"
login_password="${SMOKE_LOGIN_PASSWORD:-invalid-password}"
basic_auth="${SMOKE_CLIENT_BASIC_AUTH:-Basic Y2xpZW50OnNlY3JldA==}"
refresh_token="${SMOKE_REFRESH_TOKEN:-invalid-refresh-token}"

login_code="$(curl --silent --show-error --connect-timeout 2 --max-time 10 \
  -o /tmp/smoke-login.json -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -X POST \
  -d "{\"email\":\"${login_email}\",\"password\":\"${login_password}\"}" \
  "${BASE_URL}/v1/login")"

case "${login_code}" in
  200|400|401|403|429) ;;
  *)
    echo "Smoke check failed on /v1/login with unexpected HTTP ${login_code}" >&2
    cat /tmp/smoke-login.json >&2 || true
    exit 1
    ;;
esac

refresh_code="$(curl --silent --show-error --connect-timeout 2 --max-time 10 \
  -o /tmp/smoke-refresh.json -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -H "Authorization: ${basic_auth}" \
  -X POST \
  -d "{\"refreshToken\":\"${refresh_token}\"}" \
  "${BASE_URL}/oauth/token")"

case "${refresh_code}" in
  200|400|401) ;;
  *)
    echo "Smoke check failed on /oauth/token with unexpected HTTP ${refresh_code}" >&2
    cat /tmp/smoke-refresh.json >&2 || true
    exit 1
    ;;
esac

echo "Standby smoke checks passed."
