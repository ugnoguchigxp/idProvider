# OIDC/OAuth Compatibility Matrix

最終更新: 2026-04-26

## 1. 目的
実装済みのOIDC/OAuth仕様と未対応仕様を明示し、接続先アプリおよびSDKが事前に互換性判断できるようにする。

## 2. Endpoint責務
外部SSOの正規OIDC endpointは `OIDC_ISSUER` discovery metadata が返す `oidc-provider` endpoint とする。

- Authorization: `${OIDC_ISSUER}/auth`
- Token: `${OIDC_ISSUER}/token`
- UserInfo: `${OIDC_ISSUER}/me`
- JWKS: `${OIDC_ISSUER}/jwks`
- RP-Initiated Logout: `${OIDC_ISSUER}/session/end`

Hono側の `/oauth/token`, `/oauth/introspection`, `/oauth/revocation` は、既存 opaque token / `user_sessions` lifecycle の互換APIであり、code exchange endpointではない。

## 3. サポート範囲
### 3.1 OIDC Discovery / Key Material
- `GET /.well-known/openid-configuration`: Supported
- `GET /.well-known/jwks.json`: Supported

### 3.2 OAuth Token Lifecycle（互換API）
- `POST /oauth/token` (refresh grant): Supported
- `POST /oauth/revocation`: Supported
- `POST /oauth/introspection`: Supported
- Refresh token rotation: Supported

### 3.3 Authorization Server Behavior
- Authorization Code flow: Supported
- PKCE required: Supported（always required）
- Client auth (`client_secret_basic`): Supported
- Static client registration: Supported（DB管理 / Admin API経由）
- Production interaction: Supported
- UserInfo endpoint: Supported
- RP-Initiated Logout: Supported

## 4. Claims
### 4.1 Standard Claims
- `sub`
- `email`
- `email_verified`
- `name`
- `given_name`
- `family_name`
- `preferred_username`
- `locale`
- `zoneinfo`
- `updated_at`

### 4.2 Custom Claims
- `permissions`
- `entitlements`

## 5. SDK互換観点
### 5.1 SDKが利用する最小機能
- discovery取得
- authorization URL生成
- token exchange
- ID Token検証（issuer/audience/nonce/exp）
- refresh/revocation/introspection
- logout URL生成

### 5.2 SDKエラー正規化
Node SDK（`@idp/server-sdk`）では以下に正規化する。
- `oidc_invalid_callback`
- `oidc_invalid_response`
- `oidc_invalid_token`
- `oidc_timeout`
- `oidc_http_error`
- `oidc_rate_limited`
- `oidc_unsupported`

### 5.3 APIエラーコード（代表）
`ErrorResponse.code`:
- `invalid_client`
- `invalid_token`
- `mfa_required`
- `rate_limited`
- `unauthorized`

## 6. Client Requirements
- `token_endpoint_auth_method`: `client_secret_basic`
- `grant_types`: `authorization_code`, `refresh_token`
- `response_types`: `code`
- `redirect_uris`: Admin APIのDB client registryで登録
- `allowedScopes`: `openid` 必須。必要に応じ `profile`, `email`, `offline_access`, `permissions`, `entitlements`
- `client_secret`: 生成・ローテーション時のみ平文返却。DBはArgon2 hash保存

## 7. 未対応仕様（明示）
- Dynamic Client Registration
- Device Authorization Grant
- PAR / JAR
- CIBA
- FAPI advanced profiles
- Front/Back-channel logout complete coverage

## 8. 運用上の注意
- productionでは `devInteractions` を無効
- OIDC互換性変更時は以下を同時更新する
  1. `apps/idp-server/src/core/oidc-provider.ts`
  2. `apps/idp-server/src/core/oidc-provider.conformance.test.ts`
  3. `docs/openapi.yaml`
  4. `docs/oidc-client.md`
  5. 本ドキュメント
