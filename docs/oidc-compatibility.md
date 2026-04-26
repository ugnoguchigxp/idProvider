# OIDC/OAuth Compatibility Matrix

最終更新: 2026-04-26

## 1. 目的
本ドキュメントは、実装済みのOIDC/OAuth仕様と未対応仕様を明示し、接続先アプリが事前に互換性判断できるようにする。

## 2. サポート範囲
### 2.1 OIDC Discovery / Key Material
- `GET /.well-known/openid-configuration` : Supported
- `GET /.well-known/jwks.json` : Supported

### 2.2 OAuth Token Lifecycle
- `POST /oauth/token` (refresh grant): Supported
- `POST /oauth/revocation`: Supported
- `POST /oauth/introspection`: Supported
- Refresh token rotation: Supported

### 2.3 Authorization Server Behavior
- Authorization Code flow: Supported
- PKCE required: Supported (always required)
- Client authentication (`client_secret_basic`): Supported
- Static client registration: Supported（DB管理 / Admin API経由。旧環境変数フォールバックは移行期間中のみ）

## 3. Claims
### 3.1 Standard Claims
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

### 3.2 Custom Claims
- `permissions`
- `entitlements`

注記:
- `permissions` と `entitlements` は本実装独自拡張であり、汎用OIDCクライアントでは標準claimsとして扱われない。

## 4. Client Requirements
- `token_endpoint_auth_method`: `client_secret_basic`
- `grant_types`: `authorization_code`, `refresh_token`
- `response_types`: `code`
- `redirect_uris`: Admin API経由でクライアントごとにDBで管理

## 5. エラー/レート制限
- OAuth endpoints は `401`（client認証失敗）を返す
- OAuth/discovery系は `429`（rate_limited）を返す場合がある

## 6. 未対応仕様（明示）
- Dynamic Client Registration
- Device Authorization Grant
- PAR / JAR
- CIBA
- FAPI advanced profiles
- Front/Back-channel logout complete coverage

## 7. 運用上の注意
- productionでは `devInteractions` は無効
- OpenID Conformance Suite実施手順は `docs/openid-conformance-suite-runbook.md` を参照
- OIDC互換性変更時は以下を同時更新する
  1. `apps/idp-server/src/core/oidc-provider.ts`
  2. `apps/idp-server/src/core/oidc-provider.conformance.test.ts`
  3. `docs/openapi.yaml`
  4. 本ドキュメント
