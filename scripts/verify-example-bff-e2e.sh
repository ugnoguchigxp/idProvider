#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="${RUN_ID:-$$}"
POSTGRES_NAME="gxp-idp-example-bff-postgres-${RUN_ID}"
REDIS_NAME="gxp-idp-example-bff-redis-${RUN_ID}"
POSTGRES_PORT="${POSTGRES_PORT:-55442}"
REDIS_PORT="${REDIS_PORT:-56389}"
APP_PORT="${APP_PORT:-3310}"
OIDC_PORT="${OIDC_PORT:-3311}"
BFF_PORT="${BFF_PORT:-5173}"
DATABASE_URL="postgresql://postgres:postgres@localhost:${POSTGRES_PORT}/idp"
REDIS_URL="redis://localhost:${REDIS_PORT}"
OIDC_ISSUER="http://localhost:${OIDC_PORT}"
BFF_BASE_URL="http://localhost:${BFF_PORT}"
APP_PID=""
BFF_PID=""

cleanup() {
  if [[ -n "${BFF_PID}" ]]; then
    kill "${BFF_PID}" >/dev/null 2>&1 || true
    wait "${BFF_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${APP_PID}" ]]; then
    kill "${APP_PID}" >/dev/null 2>&1 || true
    wait "${APP_PID}" >/dev/null 2>&1 || true
  fi
  docker rm -f "${POSTGRES_NAME}" "${REDIS_NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_for_http() {
  local url="$1"
  for _ in $(seq 1 60); do
    if node -e "fetch(process.argv[1]).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" "${url}"; then
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for ${url}" >&2
  return 1
}

echo "[example-bff-e2e] starting temporary Postgres and Redis"
docker rm -f "${POSTGRES_NAME}" "${REDIS_NAME}" >/dev/null 2>&1 || true
docker run --rm -d \
  --name "${POSTGRES_NAME}" \
  -e POSTGRES_DB=idp \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p "${POSTGRES_PORT}:5432" \
  postgres:17-alpine >/dev/null
docker run --rm -d \
  --name "${REDIS_NAME}" \
  -p "${REDIS_PORT}:6379" \
  redis:7-alpine >/dev/null

for _ in $(seq 1 60); do
  if docker exec "${POSTGRES_NAME}" pg_isready -U postgres -d idp >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "${POSTGRES_NAME}" pg_isready -U postgres -d idp >/dev/null

echo "[example-bff-e2e] applying migrations"
for migration in "${ROOT_DIR}"/infra/migrations/*.sql; do
  docker exec -i "${POSTGRES_NAME}" psql -U postgres -d idp -v ON_ERROR_STOP=1 < "${migration}" >/dev/null
done

echo "[example-bff-e2e] seeding users and example BFF client"
(
  cd "${ROOT_DIR}"
  DATABASE_URL="${DATABASE_URL}" \
    OAUTH_CLIENT_ID="example-bff" \
    OAUTH_CLIENT_SECRET="example-bff-secret" \
    OIDC_CLIENT_REDIRECT_URIS="${BFF_BASE_URL}/callback" \
    GOOGLE_CLIENT_ID="dummy-google-client" \
    GOOGLE_CLIENT_SECRET="dummy-google-secret" \
    pnpm db:seed >/dev/null
)

echo "[example-bff-e2e] starting IdP"
(
  cd "${ROOT_DIR}"
  NODE_ENV=production \
    PORT="${APP_PORT}" \
    OIDC_PORT="${OIDC_PORT}" \
    OIDC_ISSUER="${OIDC_ISSUER}" \
    DATABASE_URL="${DATABASE_URL}" \
    REDIS_URL="${REDIS_URL}" \
    JWT_PRIVATE_KEY="integration-private-key" \
    MFA_RECOVERY_CODE_PEPPER="integration-mfa-recovery-pepper" \
    METRICS_ENABLED=false \
    GOOGLE_CLIENT_ID="dummy-google-client" \
    GOOGLE_CLIENT_SECRET="dummy-google-secret" \
    OAUTH_CLIENT_ID="example-bff" \
    OAUTH_CLIENT_SECRET="example-bff-secret" \
    OIDC_CLIENT_REDIRECT_URIS="${BFF_BASE_URL}/callback" \
    pnpm --filter @idp/idp-server exec tsx src/index.ts \
    >"/tmp/gxp-idp-example-bff-idp-${RUN_ID}.log" 2>&1 &
  APP_PID="$!"
)
wait_for_http "${OIDC_ISSUER}/.well-known/openid-configuration"

echo "[example-bff-e2e] starting example BFF"
(
  cd "${ROOT_DIR}"
  BFF_PORT="${BFF_PORT}" \
    BFF_BASE_URL="${BFF_BASE_URL}" \
    BFF_SESSION_SECRET="integration-example-bff-session-secret" \
    OIDC_ISSUER="${OIDC_ISSUER}" \
    OIDC_CLIENT_ID="example-bff" \
    OIDC_CLIENT_SECRET="example-bff-secret" \
    pnpm --filter @idp/example-bff exec tsx src/index.ts \
    >"/tmp/gxp-idp-example-bff-bff-${RUN_ID}.log" 2>&1 &
  BFF_PID="$!"
)
wait_for_http "${BFF_BASE_URL}/"

echo "[example-bff-e2e] running browser-like BFF flow"
OIDC_ISSUER="${OIDC_ISSUER}" BFF_BASE_URL="${BFF_BASE_URL}" node <<'NODE'
(async () => {
  const issuer = process.env.OIDC_ISSUER;
  const bffBaseUrl = process.env.BFF_BASE_URL;
  const jar = new Map();
  const cookieHeader = () =>
    [...jar.entries()]
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  const storeCookies = (response) => {
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(";");
      const [name, ...value] = pair.split("=");
      if (!name) continue;
      jar.set(name, value.join("="));
    }
  };
  const request = async (url, init = {}) => {
    const headers = new Headers(init.headers || {});
    const cookies = cookieHeader();
    if (cookies) headers.set("cookie", cookies);
    const response = await fetch(url, { ...init, headers, redirect: "manual" });
    storeCookies(response);
    return response;
  };
  const follow = async (url, init = {}) => {
    let current = new URL(url);
    let response = await request(current, init);
    for (let index = 0; index < 40; index += 1) {
      if (![302, 303, 307, 308].includes(response.status)) {
        return { current, response };
      }
      const next = new URL(response.headers.get("location"), current);
      current = next;
      response = await request(current);
    }
    throw new Error("too_many_redirects");
  };
  const signIn = async () => {
    const start = await follow(`${bffBaseUrl}/login`);
    if (start.response.status !== 200 || !start.current.pathname.startsWith("/interaction/")) {
      throw new Error(`expected_login_interaction:${start.response.status}:${start.current}`);
    }
    const callback = await follow(start.current, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        email: "user@example.com",
        password: "Password123!",
      }),
    });
    if (callback.response.status !== 200 || callback.current.toString() !== `${bffBaseUrl}/`) {
      throw new Error(`expected_bff_home:${callback.response.status}:${callback.current}`);
    }
  };

  await signIn();
  let me = await request(`${bffBaseUrl}/me`);
  if (me.status !== 200) throw new Error(`me_failed:${me.status}:${await me.text()}`);
  let body = await me.json();
  if (body.identity?.email !== "user@example.com") {
    throw new Error(`unexpected_identity:${JSON.stringify(body)}`);
  }
  if (![...jar.keys()].includes("example_bff_session")) {
    throw new Error("local_session_cookie_missing");
  }

  const localLogout = await request(`${bffBaseUrl}/logout`, { method: "POST" });
  if (localLogout.status !== 302) throw new Error(`local_logout_failed:${localLogout.status}`);
  me = await request(`${bffBaseUrl}/me`);
  if (me.status !== 401) throw new Error(`local_logout_did_not_clear_session:${me.status}`);

  const ssoAgain = await follow(`${bffBaseUrl}/login`);
  if (ssoAgain.current.origin === issuer && ssoAgain.current.pathname.startsWith("/interaction/")) {
    throw new Error("idp_prompted_login_after_local_logout");
  }
  if (ssoAgain.response.status !== 200 || ssoAgain.current.toString() !== `${bffBaseUrl}/`) {
    throw new Error(`sso_relogin_failed:${ssoAgain.response.status}:${ssoAgain.current}`);
  }

  console.log(JSON.stringify({ exampleBffE2e: true, localSession: true, ssoAfterLocalLogout: true }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE

echo "[example-bff-e2e] completed"
