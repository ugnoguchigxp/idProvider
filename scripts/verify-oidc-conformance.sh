#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[oidc-conformance] running targeted conformance tests"
pnpm --filter @idp/idp-server exec vitest run \
  src/core/oidc-provider.conformance.test.ts \
  src/modules/auth/oauth.conformance.test.ts \
  src/contracts/mfa-oauth-oidc.openapi-contract.test.ts

echo "[oidc-conformance] validating OpenAPI contract"
pnpm verify:openapi

echo "[oidc-conformance] completed"
