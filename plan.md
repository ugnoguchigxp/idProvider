# 目的

対コンシューマー向けの本格的な自前IDプロバイダー（IdP）を構築する。

以下の制約を満たす：

- Cognito / Auth0 / Firebase Auth / Supabase Auth / Clerk / MSAL などの外部認証基盤は使用しない
- ただし、Google（Gmail）ログインは「外部IdP連携（フェデレーション）」として対応する
- 将来的に100万人規模で利用されることを想定する
- 複数マイクロサービスのSSO基盤として機能する設計にする
- 高可用性・ゼロダウンタイムを考慮する

---

# 使用技術

- 言語: TypeScript
- ランタイム: Node.js 24 LTS（`>=24.0.0`）
- フレームワーク: Hono
- OIDC: `oidc-provider`
- DB: PostgreSQL
- キャッシュ: Redis
- ORM: Drizzle ORM
- パッケージ管理: pnpm
- pnpmバージョン: 10系
- モノレポ: pnpm workspace
- ローカル開発: Docker Compose
- パスワードハッシュ: Argon2id
- MFA: TOTP（将来WebAuthn対応可能な設計）
- バリデーション: Zod
- ログ: 構造化ログ（JSON）

---

# 非対象（やらないこと）

以下はIdPには含めない：

- 決済
- 請求
- クーポン
- プロモーション

ただし、ユーザー属性・ロール・権限・entitlementはIdPに含める。

---

# 全体構成

```txt
idp/
├─ apps/
│  └─ idp-server/
├─ packages/
│  ├─ db/
│  ├─ auth-core/
│  ├─ oidc-client-sdk/
│  ├─ server-sdk/
│  └─ shared/
├─ infra/
└─ docs/
```

---

# idp-server の役割（Hono）

以下の機能を持つ：

- サインアップ
- ログイン
- メール確認
- パスワード認証
- MFA登録・検証
- ログアウト
- OIDCエンドポイント（oidc-provider）
- Googleログイン連携
- UserInfo API
- 認可チェックAPI
- ヘルスチェック

---

# DB設計（必須テーブル）

```txt
users
user_profiles
user_emails
user_passwords
external_identities
mfa_factors
user_sessions
oauth_clients
oauth_authorization_codes
oauth_access_tokens
oauth_refresh_tokens
roles
permissions
role_permissions
user_roles
groups
group_members
group_roles
entitlements
user_entitlements
organization_entitlements
email_verification_tokens
password_reset_tokens
login_attempts
security_events
audit_logs
signing_keys
```

重要：

- emailはusersに直接持たせない
- user_emailsで管理する

---

# auth-core

ドメインロジックを実装：

- Argon2idパスワードハッシュ
- パスワードポリシー
- ログイン試行制御
- アカウントロック
- TOTP生成・検証
- セッション管理
- リフレッシュトークンローテーション
- 監査ログ生成
- セキュリティイベント生成

---

# トークン設計

OIDC Authorization Code + PKCE を使用。

発行：

```txt
access_token
refresh_token
id_token
```

寿命：

```txt
access_token: 5〜15分
refresh_token: 7〜30日
id_token: 5〜15分
```

必須：

- refresh token rotation
- 再利用検知でセッション無効化
- トークン失効（revocation）と検証（introspection）をサポートする

署名鍵運用（`signing_keys`）：

- `kid` を付与して複数鍵を並行運用可能にする
- 定期ローテーション（例: 90日）を前提とする
- 新旧鍵の重複公開期間を設けてゼロダウンタイムで切替える
- 緊急失効手順（漏えい時）を定義し、即時ローテーション可能にする

---

# Googleログイン

設計：

```txt
ユーザー
→ IdP
→ Googleログイン
→ Google OIDC
→ IdPに戻る
→ ユーザー作成 or 紐付け
→ IdPトークン発行
```

注意：

- クライアントはGoogleを直接信頼しない
- 必ずIdP発行トークンを使う

後からの紐付け（既存アカウント連携）にも対応する：

- 既存ログイン済みセッションからのみ `POST /v1/identities/google/link` を許可する
- 紐付け前に再認証（パスワードまたはMFA）を必須にする
- Google側の `email_verified=true` を必須にする
- すでに他アカウントに紐付いたGoogle subjectは連携不可にする
- 連携/解除イベントを監査ログ・セキュリティイベントへ記録する

---

# RBAC / Entitlement

定義：

```txt
RBAC = 操作権限
Entitlement = 機能利用権
```

API：

```txt
POST /v1/authorization/check
```

JWTには最小限のみ含める。

---

# UserInfo API

スコープベースで情報制御：

```txt
openid
profile
email
phone
```

---

# セキュリティ要件

必須：

- Argon2id
- メール確認必須
- MFAは全ユーザー必須方針
- ただしMFA未登録ユーザーは即時ブロックせず、ログイン時に強い警告を毎回表示する
- MFA未登録警告にはセットアップ導線を必ず含める
- レート制限
- CSRF対策
- Cookie安全設定
- localStorageにトークン保存禁止
- ログイン失敗通知
- 監査ログ
- `refresh_token.reuse_detected` 発生時は自動で対象セッションを無効化する
- 高リスク時（再利用検知・異常IP・異常デバイス）は追加再認証を要求する
- 高リスクイベントはユーザー通知（メール等）を行う

イベント例：

```txt
login.success
login.failed
mfa.enabled
mfa.warning_shown
password.changed
refresh_token.reuse_detected
identity.google.linked
identity.google.unlinked
```

---

# 高可用性設計

前提：

- アプリはステートレス
- セッションはDB/Redis管理

構成：

```txt
app x2以上
PostgreSQL primary + replica
Redis
ロードバランサ
```

復旧目標とバックアップ：

- RPO/RTOを事前定義する（例: RPO 15分以内, RTO 60分以内）
- DBバックアップと復元手順を運用Runbookとして管理する
- 定期的にリストアテストを実施し、復旧可能性を検証する

---

# データ移行・互換性方針

- ゼロダウンタイム移行のため DB マイグレーションは expand/contract を原則とする
- 後方互換を保った段階的リリース（旧新コード共存期間）を設ける
- 破壊的変更はフラグ管理または複数リリースで段階適用する

---

# API

```txt
POST /v1/signup
POST /v1/login
POST /v1/logout
GET  /v1/me
POST /v1/mfa/enroll
POST /v1/mfa/verify
POST /v1/password/change
POST /v1/password/reset/request
POST /v1/password/reset/confirm
POST /v1/identities/google/link
POST /v1/identities/google/unlink
GET  /v1/sessions
POST /v1/sessions/revoke
POST /v1/sessions/revoke-all
GET  /healthz
GET  /readyz

GET  /.well-known/openid-configuration
GET  /.well-known/jwks.json
POST /oauth/revocation
POST /oauth/introspection
```

---

# セッション・デバイス管理

- ユーザーがアクティブセッション一覧を確認できる
- 端末単位のセッション失効（強制ログアウト）を可能にする
- 全端末ログアウトを可能にする
- セッションには最終利用時刻・IP・User-Agent等を保持する

---

# 権限モデル運用境界

- RBAC/Entitlementの変更可能主体（管理者ロール）を明確化する
- 権限変更は監査ログへ必ず記録する
- 権限変更の反映タイミング（即時反映 or 次回トークン更新時）を定義する
- 高権限操作は二段階承認または強再認証を要求する

---

# コーディングルール

- TypeScript strict
- any禁止
- Zod必須
- 型定義はZod schemaを単一情報源（Single Source of Truth）として採用し、必要なTypeScript型はschemaから導出する
- APIエンドポイントは必ずアダプター層経由でのみ公開する
- アダプターは `authenticatedEndpointAdapter` または `publicEndpointAdapter` の2種に限定する
- ルートハンドラ直書きでのエンドポイント公開を禁止する
- エラーハンドリング統一
- 共通エラーレスポンス仕様（コード/メッセージ/トレースID）を強制する
- 入力値は境界で検証・サニタイズする（Zod + 明示的な正規化）
- セキュリティ優先
- OIDCロジックとアプリロジックを分離
- OpenAPI起点の契約テストをCIで必須化し、仕様と実装の乖離を防止する

---

# 運用・観測方針（本プロジェクト対象）

- モニター製品の選定・導入は本プロジェクトのスコープ外
- ただし将来の監視連携を前提に、ログ仕様は統一する
- 構造化ログ（JSON）で出力し、必須フィールド（timestamp, level, service, trace_id, user_id, event, error_code）を定義する
- 監査ログ・セキュリティイベント・アプリケーションログの分類を統一する
- 例外は握りつぶさず、共通ハンドラで記録・マッピングして返却する
- 開発・テストではMSW（Mock Service Worker）で外部依存/下流APIをモック可能にする

データ保持・削除ポリシー：

- 監査ログ、セキュリティイベント、セッション情報の保持期間を定義する
- 保持期限超過データは定期ジョブで削除または匿名化する
- 法令・規約要件に応じた保持期間の例外ルールを定義する

---

# 環境変数・シークレット方針

- シークレットは `.env` 直参照ではなく設定アダプター経由で取得する
- 必須シークレット（JWT署名鍵、DB接続情報、Redis接続情報、Google OIDCクレデンシャル）の未設定時は起動失敗とする
- 鍵・クレデンシャルはローテーション可能な設計にし、再起動なし反映方式を優先する
- ログに秘密情報を出力しない（マスキングを必須化）

---

# 開発開始判定（Go/No-Go）

Go条件：

- Node.js 24 LTS と pnpm 10系でローカル起動できる
- `openapi.yaml` の雛形と主要エンドポイント定義が存在する
- `authenticatedEndpointAdapter` / `publicEndpointAdapter` の共通インターフェースが実装されている
- DBマイグレーション初版（users, user_emails, user_passwords, user_sessions, signing_keys）が適用可能
- MSWで signup/login/refresh/authorization check のモックが動作する
- 契約テストと単体テストをCIで実行できる

No-Go条件：

- 署名鍵管理とローテーション手順が未定義
- エラー仕様と入力検証境界が未統一
- APIがアダプター層を経由せず直接公開されている

---

# テスト・性能要件

- 主要フロー（signup/login/token refresh/authorization check）のE2Eを整備する
- 負荷試験で目標値を定義する（TPS, p95 latency, error rate）
- 代表目標（初期値）: login 200 TPS, token 500 TPS, authorization check 1000 TPS, p95 < 200ms
- CIで契約テスト、セキュリティテスト、主要負荷シナリオの定期実行を行う

---

# 成果物

以下を出力：

- モノレポ構成
- DBスキーマ
- Honoサーバー
- OIDC統合
- MFAスケルトン
- SDK
- OpenAPI仕様書（`openapi.yaml` を正本、必要に応じて `openapi.json` も出力）
- MSWモック定義（主要APIフロー分）
- 契約テスト一式（OpenAPI準拠）
- 負荷試験シナリオと結果レポート雛形
- 運用Runbook（鍵ローテーション/障害復旧/緊急失効）
- Docker Compose
- README
- 設計書
