#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="${RUN_ID:-$$}"
POSTGRES_NAME="gxp-idp-sso-postgres-${RUN_ID}"
REDIS_NAME="gxp-idp-sso-redis-${RUN_ID}"
POSTGRES_PORT="${POSTGRES_PORT:-55432}"
REDIS_PORT="${REDIS_PORT:-56379}"
APP_PORT="${APP_PORT:-3300}"
OIDC_PORT="${OIDC_PORT:-3301}"
DATABASE_URL="postgresql://postgres:postgres@localhost:${POSTGRES_PORT}/idp"
REDIS_URL="redis://localhost:${REDIS_PORT}"
OIDC_ISSUER="http://localhost:${OIDC_PORT}"
APP_PID=""
COOKIE_FILE="$(mktemp)"

cleanup() {
  if [[ -n "${APP_PID}" ]]; then
    kill "${APP_PID}" >/dev/null 2>&1 || true
    wait "${APP_PID}" >/dev/null 2>&1 || true
  fi
  docker rm -f "${POSTGRES_NAME}" "${REDIS_NAME}" >/dev/null 2>&1 || true
  rm -f "${COOKIE_FILE}"
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

start_app() {
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
    OAUTH_CLIENT_ID="app-a" \
    OAUTH_CLIENT_SECRET="app-a-secret" \
    OIDC_CLIENT_REDIRECT_URIS="http://localhost:5173/callback,http://localhost:5174/callback" \
    pnpm --filter @idp/idp-server exec tsx src/index.ts \
    >"/tmp/gxp-idp-sso-e2e-${RUN_ID}.log" 2>&1 &
  APP_PID="$!"
  wait_for_http "${OIDC_ISSUER}/.well-known/openid-configuration"
}

stop_app() {
  if [[ -n "${APP_PID}" ]]; then
    kill "${APP_PID}" >/dev/null 2>&1 || true
    wait "${APP_PID}" >/dev/null 2>&1 || true
    APP_PID=""
  fi
}

echo "[sso-e2e] starting temporary Postgres and Redis"
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

echo "[sso-e2e] applying migrations"
for migration in "${ROOT_DIR}"/infra/migrations/*.sql; do
  docker exec -i "${POSTGRES_NAME}" psql -U postgres -d idp -v ON_ERROR_STOP=1 < "${migration}" >/dev/null
done

echo "[sso-e2e] seeding users and clients"
(
  cd "${ROOT_DIR}"
  DATABASE_URL="${DATABASE_URL}" \
    OAUTH_CLIENT_ID="app-a" \
    OAUTH_CLIENT_SECRET="app-a-secret" \
    OIDC_CLIENT_REDIRECT_URIS="http://localhost:5173/callback,http://localhost:5174/callback" \
    GOOGLE_CLIENT_ID="dummy-google-client" \
    GOOGLE_CLIENT_SECRET="dummy-google-secret" \
    pnpm db:seed >/dev/null
)

(
  cd "${ROOT_DIR}"
  DATABASE_URL="${DATABASE_URL}" pnpm --filter @idp/idp-server exec tsx -e '
import { createDb, oauthClientRedirectUris, oauthClientScopes, oauthClientSecrets, oauthClients } from "@idp/db";
import { hashPassword } from "./src/core/password.ts";
void (async () => {
  const { db, pool } = createDb(process.env.DATABASE_URL!);
  const [client] = await db
    .insert(oauthClients)
    .values({
      clientId: "app-b",
      name: "App B",
      clientType: "confidential",
      tokenEndpointAuthMethod: "client_secret_basic",
      status: "active",
    })
    .onConflictDoUpdate({
      target: oauthClients.clientId,
      set: { name: "App B", status: "active", updatedAt: new Date() },
    })
    .returning();
  if (!client) throw new Error("failed_to_upsert_app_b");
  await db.insert(oauthClientSecrets).values({
    clientPkId: client.id,
    secretHash: await hashPassword("app-b-secret"),
    secretHint: "cret",
    isPrimary: true,
  });
  await db.insert(oauthClientRedirectUris).values({
    clientPkId: client.id,
    redirectUri: "http://localhost:5174/callback",
  });
  for (const scope of ["openid", "profile", "email"]) {
    await db.insert(oauthClientScopes).values({ clientPkId: client.id, scope });
  }
  await pool.end();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
'
)

echo "[sso-e2e] starting IdP"
start_app

echo "[sso-e2e] running first-client login, token exchange, userinfo, and second-client SSO"
OIDC_ISSUER="${OIDC_ISSUER}" COOKIE_FILE="${COOKIE_FILE}" node <<'NODE'
(async () => {
  const crypto = require("node:crypto");
  const fs = require("node:fs");
  const issuer = process.env.OIDC_ISSUER;
  const discovery = await fetch(`${issuer}/.well-known/openid-configuration`).then((r) => r.json());
  const jar = new Map();
  const cookieHeader = () => [...jar.entries()].filter(([, value]) => value).map(([key, value]) => `${key}=${value}`).join("; ");
  const storeCookies = (response) => {
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(";");
      const [name, ...value] = pair.split("=");
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
  const base64url = (buf) => Buffer.from(buf).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const authUrl = (clientId, redirectUri, state, nonce, challenge) => {
    const url = new URL(discovery.authorization_endpoint);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "openid profile email");
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url;
  };
  const follow = async (url) => {
    let current = new URL(url);
    let response = await request(current);
    for (let index = 0; index < 20; index += 1) {
      if (![302, 303, 307, 308].includes(response.status)) return { current, response };
      const next = new URL(response.headers.get("location"), current);
      if (next.origin !== issuer) return { current: next, response };
      current = next;
      response = await request(current);
    }
    throw new Error("too_many_redirects");
  };

  const verifierA = base64url(crypto.randomBytes(32));
  const challengeA = base64url(crypto.createHash("sha256").update(verifierA).digest());
  const loginStart = await follow(authUrl("app-a", "http://localhost:5173/callback", "state-a", "nonce-a", challengeA));
  if (loginStart.response.status !== 200 || !loginStart.current.pathname.startsWith("/interaction/")) {
    throw new Error(`expected_login_interaction:${loginStart.response.status}:${loginStart.current}`);
  }

  let response = await request(loginStart.current, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: "user@example.com", password: "Gxp#Idp!2026$Secure" }),
  });
  let current = loginStart.current;
  let callbackA;
  for (let index = 0; index < 20; index += 1) {
    if (![302, 303, 307, 308].includes(response.status)) throw new Error(`expected_redirect_after_login:${response.status}`);
    const next = new URL(response.headers.get("location"), current);
    if (next.origin !== issuer) {
      callbackA = next;
      break;
    }
    current = next;
    response = await request(current);
  }
  const codeA = callbackA?.searchParams.get("code");
  if (!codeA) throw new Error("app_a_code_missing");

  const tokenResponse = await request(discovery.token_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from("app-a:app-a-secret").toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: codeA,
      redirect_uri: "http://localhost:5173/callback",
      code_verifier: verifierA,
    }),
  });
  if (tokenResponse.status !== 200) throw new Error(`token_exchange_failed:${tokenResponse.status}:${await tokenResponse.text()}`);
  const tokens = await tokenResponse.json();
  if (!tokens.id_token || !tokens.access_token) throw new Error("token_response_missing_tokens");

  const userInfoResponse = await request(discovery.userinfo_endpoint, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (userInfoResponse.status !== 200) throw new Error(`userinfo_failed:${userInfoResponse.status}:${await userInfoResponse.text()}`);
  const userInfo = await userInfoResponse.json();
  if (userInfo.email !== "user@example.com") throw new Error(`unexpected_userinfo:${JSON.stringify(userInfo)}`);

  const verifierB = base64url(crypto.randomBytes(32));
  const challengeB = base64url(crypto.createHash("sha256").update(verifierB).digest());
  const callbackB = await follow(authUrl("app-b", "http://localhost:5174/callback", "state-b", "nonce-b", challengeB));
  if (!callbackB.current.toString().startsWith("http://localhost:5174/callback") || !callbackB.current.searchParams.get("code")) {
    throw new Error(`app_b_sso_failed:${callbackB.response.status}:${callbackB.current}`);
  }

  fs.writeFileSync(process.env.COOKIE_FILE, JSON.stringify([...jar.entries()]));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE

echo "[sso-e2e] restarting IdP and verifying persisted session SSO"
stop_app
start_app

OIDC_ISSUER="${OIDC_ISSUER}" COOKIE_FILE="${COOKIE_FILE}" node <<'NODE'
(async () => {
  const crypto = require("node:crypto");
  const fs = require("node:fs");
  const issuer = process.env.OIDC_ISSUER;
  const discovery = await fetch(`${issuer}/.well-known/openid-configuration`).then((r) => r.json());
  const jar = new Map(JSON.parse(fs.readFileSync(process.env.COOKIE_FILE, "utf8")));
  const cookieHeader = () => [...jar.entries()].filter(([, value]) => value).map(([key, value]) => `${key}=${value}`).join("; ");
  const request = async (url) => {
    const headers = new Headers();
    const cookies = cookieHeader();
    if (cookies) headers.set("cookie", cookies);
    return fetch(url, { headers, redirect: "manual" });
  };
  const base64url = (buf) => Buffer.from(buf).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("client_id", "app-b");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", "http://localhost:5174/callback");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", "restart-b");
  url.searchParams.set("nonce", "restart-b");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  let current = url;
  let response = await request(current);
  for (let index = 0; index < 20; index += 1) {
    if (![302, 303, 307, 308].includes(response.status)) break;
    const next = new URL(response.headers.get("location"), current);
    if (next.origin !== issuer) {
      if (!next.toString().startsWith("http://localhost:5174/callback") || !next.searchParams.get("code")) {
        throw new Error(`restart_sso_code_missing:${next}`);
      }
      console.log(JSON.stringify({ restartSsoCode: true, callback: next.origin + next.pathname }));
      return;
    }
    current = next;
    response = await request(current);
    if (response.status === 200 && current.pathname.startsWith("/interaction/")) {
      throw new Error("login_required_after_restart");
    }
  }
  throw new Error(`restart_sso_failed:${response.status}:${current}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE

echo "[sso-e2e] completed"
