# gxp-idProvider

TypeScript で構築した Identity Provider (IdP) モノレポです。  
Hono ベースの API と `oidc-provider` を組み合わせ、OIDC/OAuth2、認証、認可、監査、運用バッチを一貫して提供します。

## 概要

- ランタイム: Node.js 24 LTS
- パッケージ管理: pnpm 10+
- API サーバー: Hono (`apps/idp-server`)
- OIDC 実装: `oidc-provider`
- DB: PostgreSQL + Drizzle ORM
- バリデーション: Zod
- ログ: pino
- テスト: Vitest
- Lint/Format: Biome

## このリポジトリで重視している設計

- API エンドポイントは adapter 経由で公開する
- 認証要件がある API は `authenticated-endpoint-adapter` 経由
- 非認証 API は `public-endpoint-adapter` 経由
- 入力バリデーションは Zod スキーマを単一ソース化
- OpenAPI 仕様 (`docs/openapi.yaml`) と実装の整合性を `verify` で確認

## 主な機能

- ユーザー認証
  - サインアップ / ログイン / ログアウト
  - アクセストークン + リフレッシュトークン (RTR)
  - セッション一覧 / 個別失効 / 全失効
- 認証強化
  - Argon2id パスワードハッシュ
  - ローカルアカウント向け MFA (TOTP)
  - パスワードレスログイン向け Passkeys (WebAuthn / user verification required)
  - レート制限 (signup / login / WebAuthn / email verification / password reset)
- 認可
  - `authorization/check` (RBAC)
  - `entitlements/check` (attribute/quantity 型 entitlement)
  - 組織・グループ文脈を考慮した判定
- OIDC/OAuth2
  - Discovery (`/.well-known/openid-configuration`)
  - JWKS (`/.well-known/jwks.json`)
  - Token refresh / Introspection / Revocation
  - JWKS ローテーション
- 外部 IdP 連携
  - Google ID Token によるログイン / 自動サインアップ
  - Google identity の link / unlink
  - 管理設定で Google 連携の有効/無効を切り替え
  - ソーシャル専用アカウントの MFA は外部 IdP 側に委譲
  - ローカルパスワードを持つアカウントに Google を紐付けた場合は、この IdP 側の MFA を維持
- 管理 UI / 設定管理
  - React ベースの `apps/admin-ui`
  - `/v1/admin/*` API (cookie または Bearer token)
  - `system_configs` テーブルによる動的設定
  - ソーシャルログイン、通知、メールテンプレート管理
- 監査・セキュリティ
  - `audit_logs` / `security_events` 記録
  - セキュリティイベント連動の通知トリガー
- データ保持・匿名化
  - 監査ログ、セキュリティイベント、セッションを対象
  - legal hold (`legal_holds`) を考慮
  - dry-run / advisory lock 対応のバッチ

## プロジェクト構成

```text
.
├── apps/
│   ├── idp-server/                 # API サーバー + OIDC 起動
│   └── admin-ui/                   # React 管理画面
├── packages/
│   ├── auth-core/                  # 認証・認可ドメインロジック
│   ├── db/                         # Drizzle schema / DB client
│   ├── shared/                     # Zod schema / 共通エラー
│   ├── oidc-client-sdk/            # OIDC クライアント SDK
│   └── server-sdk/                 # サーバー統合向け SDK
├── infra/
│   ├── docker-compose.yml          # Postgres / Redis
│   └── migrations/                 # SQL マイグレーション
├── docs/
│   ├── openapi.yaml                # OpenAPI 仕様
│   ├── admin-ui-plan.md            # 管理UI計画
│   ├── google-federation.md        # Google 連携設計
│   ├── oidc-client.md              # OIDC client 計画
│   └── qa-and-performance-plan.md  # QA/性能計画
└── plan.md                         # 実装計画メモ
```

## 前提条件

- Node.js `>= 24.0.0`
- pnpm `>= 10`
- Docker / Docker Compose

## セットアップ

```bash
pnpm install
cp .env.example .env
pnpm stack:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

起動後:

- API: `http://localhost:3000`
- OIDC issuer: `http://localhost:3001`
- Admin UI: `http://localhost:5173` (`pnpm dev:admin` 実行時)

## 環境変数

`.env.example` をベースに設定します。主な変数は以下です。

- 基本
  - `NODE_ENV`, `PORT`, `OIDC_PORT`, `OIDC_ISSUER`
- OAuth クライアント認証
  - `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OIDC_CLIENT_REDIRECT_URIS`
- トークン有効期限
  - `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`
- パスワードハッシュ
  - `ARGON2_MEMORY_COST`, `ARGON2_TIME_COST`, `ARGON2_PARALLELISM`
- レート制限
  - `RATE_LIMIT_SIGNUP_PER_MIN`, `RATE_LIMIT_LOGIN_PER_MIN`
  - `RATE_LIMIT_OAUTH_PER_MIN`, `RATE_LIMIT_DISCOVERY_PER_MIN`
- MFA
  - `MFA_ISSUER`
- JWKS
  - `JWKS_ROTATION_INTERVAL_HOURS`, `JWKS_GRACE_PERIOD_HOURS`
- WebAuthn (Passkeys)
  - `WEBAUTHN_RP_NAME`, `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`
- データ保持
  - `RETENTION_AUDIT_LOG_ANONYMIZE_DAYS`, `RETENTION_AUDIT_LOG_DELETE_DAYS`
  - `RETENTION_SECURITY_EVENT_ANONYMIZE_DAYS`, `RETENTION_SECURITY_EVENT_DELETE_DAYS`
  - `RETENTION_SESSION_ANONYMIZE_DAYS`, `RETENTION_SESSION_DELETE_DAYS`
  - `RETENTION_BATCH_CHUNK_SIZE`, `RETENTION_JOB_LOCK_KEY`
- インフラ
  - `DATABASE_URL`, `REDIS_URL`, `JWT_PRIVATE_KEY`
- Google 連携
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- 観測
  - `LOG_LEVEL`, `OTEL_EXPORTER_OTLP_ENDPOINT`

補足:

- 本番環境では `JWT_PRIVATE_KEY` に開発用値を使えないようにバリデーションしています。
- retention 系は `ANONYMIZE_DAYS <= DELETE_DAYS` の整合性チェックがあります。

## API エンドポイント概要

詳細は [`docs/openapi.yaml`](docs/openapi.yaml) を参照してください。

- Public
  - `POST /v1/signup`
  - `POST /v1/login`
  - `POST /v1/login/google`
  - `POST /v1/token/refresh`
  - `POST /oauth/token`
  - `POST /oauth/introspection`
  - `POST /oauth/revocation`
  - `POST /v1/email/verify/request`
  - `POST /v1/email/verify/confirm`
  - `POST /v1/password/reset/request`
  - `POST /v1/password/reset/confirm`
  - `POST /v1/mfa/webauthn/authenticate/options`
  - `POST /v1/mfa/webauthn/authenticate/verify`
  - `GET /healthz`, `GET /readyz`
- Authenticated
  - `GET /v1/me`
  - `POST /v1/logout`
  - `POST /v1/mfa/enroll`
  - `POST /v1/mfa/verify`
  - `POST /v1/mfa/recovery-codes/regenerate`
  - `GET /v1/mfa/webauthn/register/options`
  - `POST /v1/mfa/webauthn/register/verify`
  - `POST /v1/password/change`
  - `POST /v1/authorization/check`
  - `POST /v1/entitlements/check`
  - `GET /v1/sessions`
  - `POST /v1/sessions/revoke`
  - `POST /v1/sessions/revoke-all`
  - `POST /v1/identities/google/link`
  - `POST /v1/identities/google/unlink`
- Admin
  - `GET /v1/admin/configs`
  - `PUT /v1/admin/configs/social-login/google`
  - `PUT /v1/admin/configs/notifications`
  - `PUT /v1/admin/configs/email-template`
  - `GET /v1/admin/oauth/clients`
  - `POST /v1/admin/oauth/clients`
  - `PUT /v1/admin/oauth/clients/{clientId}`
  - `POST /v1/admin/oauth/clients/{clientId}/rotate-secret`
  - `POST /v1/admin/oauth/clients/{clientId}/disable`
  - `POST /v1/admin/oauth/clients/{clientId}/enable`

## 管理 UI の使い方

1. API サーバーを起動 (`pnpm dev`)
2. 管理 UI を起動 (`pnpm dev:admin`)
3. 管理者ユーザーの認証後、`idp_access_token` cookie で `/v1/admin/*` を操作
4. 更新系 (`PUT/POST`) は `x-csrf-token` ヘッダーに `idp_csrf_token` cookie 値を設定
5. 設定変更を保存すると `system_configs` に反映

## データ保持バッチ

- dry-run

```bash
pnpm retention:dry-run
```

- 実行

```bash
pnpm retention:run
```

実装ポイント:

- `pg_try_advisory_lock` で同時実行防止
- chunk 処理
- 匿名化フェーズ -> 削除フェーズ
- active legal hold 対象ユーザー関連データは除外

## 開発コマンド

- `pnpm dev`: idp-server 開発起動
- `pnpm dev:admin`: React 管理UI 開発起動
- `pnpm build`: 全ワークスペース build
- `pnpm typecheck`: 全ワークスペース型チェック
- `pnpm test`: 全ワークスペーステスト
- `pnpm lint`: Biome lint
- `pnpm format`: Biome format
- `pnpm db:migrate`: DB マイグレーション
- `pnpm stack:up`: ローカル依存起動
- `pnpm stack:down`: ローカル依存停止

## 品質ゲート (`verify`)

```bash
pnpm verify
```

`verify` の内容:

1. `pnpm verify:lint` (Biome)
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm verify:contract` (OpenAPI 契約テスト)
5. `pnpm verify:build`
6. `pnpm verify:openapi` (Redocly lint)

補助コマンド:

- `pnpm verify:security` (`pnpm audit --audit-level=high`)
- `pnpm verify:contract` (`apps/idp-server` の OpenAPI 契約テストのみ実行)
- `pnpm verify:oidc-conformance` (OIDC/OAuth conformance focused test + OpenAPI lint)

## ドキュメント

- OpenAPI: [`docs/openapi.yaml`](docs/openapi.yaml)
- 管理UI計画: [`docs/admin-ui-plan.md`](docs/admin-ui-plan.md)
- Google連携設計: [`docs/google-federation.md`](docs/google-federation.md)
- OIDC Client 計画: [`docs/oidc-client.md`](docs/oidc-client.md)
- OpenID Conformance Suite Runbook: [`docs/openid-conformance-suite-runbook.md`](docs/openid-conformance-suite-runbook.md)
- QA/性能計画: [`docs/qa-and-performance-plan.md`](docs/qa-and-performance-plan.md)

## ライセンス

MIT
