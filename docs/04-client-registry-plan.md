# Client Registry計画（実行可能版）

最終更新: 2026-04-26

## 0. 実装状況（2026-04-26）
- [x] OAuth endpoint の client auth は DB lookup に移行（移行用env fallbackあり）
- [x] DBベースの client registry テーブル実装済み
- [x] client secret rotation 実装済み
- [x] admin API での client 管理実装済み
- [x] client管理系の監査イベント記録実装済み

## 1. 目的
OAuth/OIDC client を env 固定から DB 管理へ移行し、以下を本番運用レベルで実現する。

- 複数clientの同時運用
- redirect URI / grant / scope 制御
- secret rotation（旧secret猶予期間あり）
- client停止/再開の即時反映
- 監査可能な運用履歴

## 2. 完了定義（Definition of Done）
以下をすべて満たしたら完了。

- `oauth_clients` 系テーブルと migration が追加される。
- OAuth client auth が DB lookup ベースで動作する（移行期間はenv fallback許容）。
- `/oauth/token`, `/oauth/introspection`, `/oauth/revocation` が client状態を強制する。
- Admin API で client 作成/更新/停止/secret rotation が実行できる。
- `docs/openapi.yaml` と契約テストが更新され `pnpm verify` が通る。
- client管理の監査イベントが `security_events` に記録される。

## 3. スコープ
### 3.1 対象
- DB schema/migration
- OAuth client 認証ロジック
- Admin API（client registry 管理）
- OpenAPI / 契約テスト
- seed / runbook / 運用手順

### 3.2 対象外
- Dynamic Client Registration（外部セルフ登録）
- JWK/JWKSベースの private_key_jwt
- SaaS向け developer portal UI

## 4. 現状ギャップ
1. 単一client前提で運用柔軟性が低い。
2. secret rotation ができず、漏洩時の影響半径が大きい。
3. redirect URI / grant / scope 制御が client 単位で管理できない。
4. client操作の監査証跡がなく、監査説明が弱い。

## 5. 目標アーキテクチャ
- client本体: `oauth_clients`
- secret管理: `oauth_client_secrets`（hash保存、平文非保持）
- redirect URI: `oauth_client_redirect_uris`
- scope制御: `oauth_client_scopes`
- 監査: `oauth_client_audit_logs` + 既存 `security_events`

認証フロー（`client_secret_basic`）:
1. Authorization header を decode
2. `client_id` で active client を取得
3. 有効な secret hash 群と定数時間比較
4. client status / secret有効期間を検証
5. 成功時に OAuth endpoint を継続、失敗時 `401 invalid_client`

## 6. DB設計（確定版）
### 6.1 `oauth_clients`
- `id` uuid PK
- `client_id` varchar(128) unique not null
- `name` varchar(160) not null
- `client_type` varchar(32) not null (`confidential` / `public`)
- `token_endpoint_auth_method` varchar(64) not null default `client_secret_basic`
- `status` varchar(32) not null default `active` (`active` / `disabled`)
- `access_token_ttl_seconds` int nullable
- `refresh_token_ttl_seconds` int nullable
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()
- indexes: `client_id` unique, `status`

### 6.2 `oauth_client_secrets`
- `id` uuid PK
- `client_id` uuid FK -> `oauth_clients.id` on delete cascade
- `secret_hash` text not null
- `secret_hint` varchar(16) not null（末尾4文字など）
- `is_primary` boolean not null default false
- `expires_at` timestamptz nullable
- `grace_until` timestamptz nullable
- `revoked_at` timestamptz nullable
- `created_at` timestamptz not null default now()
- constraints:
  - active secret の同時 primary は1つ
  - `grace_until >= created_at`
- indexes: `(client_id, is_primary)`, `(client_id, revoked_at)`

### 6.3 `oauth_client_redirect_uris`
- `id` uuid PK
- `client_id` uuid FK -> `oauth_clients.id` on delete cascade
- `redirect_uri` text not null
- `created_at` timestamptz not null default now()
- unique: `(client_id, redirect_uri)`

### 6.4 `oauth_client_scopes`
- `id` uuid PK
- `client_id` uuid FK -> `oauth_clients.id` on delete cascade
- `scope` varchar(128) not null
- `created_at` timestamptz not null default now()
- unique: `(client_id, scope)`

### 6.5 `oauth_client_audit_logs`
- `id` uuid PK
- `client_id` uuid nullable FK -> `oauth_clients.id` on delete set null
- `actor_user_id` uuid nullable FK -> `users.id` on delete set null
- `event_type` varchar(64) not null
- `payload` jsonb not null default '{}'::jsonb
- `created_at` timestamptz not null default now()
- index: `(client_id, created_at desc)`

## 7. 実装タスク（ファイル単位）
### Task 1: DB schema + migration
対象:
- 更新: `packages/db/src/schema.ts`
- 追加: `infra/migrations/0006_add_oauth_client_registry.sql`
- 更新: `packages/db/src/index.ts`（export整備）

内容:
- 6章のテーブルをDrizzle定義 + SQL migration化
- 主要制約とindexを追加

完了条件:
- migration適用後に `pnpm db:migrate` 成功

### Task 2: Repository実装
対象:
- 追加: `apps/idp-server/src/modules/oauth-clients/oauth-client.repository.ts`
- 追加: `apps/idp-server/src/modules/oauth-clients/oauth-client.repository.test.ts`
- 更新: `apps/idp-server/src/composition/create-repositories.ts`

内容:
- client取得（client_idでactive検索）
- secret検証用データ取得（有効期間、grace期間考慮）
- admin用 CRUD / rotation / status切替

完了条件:
- repository unit testで主要分岐を網羅

### Task 3: OAuth client auth切替
対象:
- 更新: `apps/idp-server/src/core/oauth-client-auth.ts`
- 更新: `apps/idp-server/src/core/oauth-client-auth.test.ts`
- 更新: `apps/idp-server/src/modules/auth/auth.routes.ts`
- 更新: `apps/idp-server/src/app.ts`

内容:
- 現在の `assertOAuthClientAuth(authorization, envCredentials)` を
  `assertOAuthClientAuth(authorization, resolver)` 形式へ変更
- secret hash 比較（timing safe）を導入
- `/oauth/token` `/oauth/introspection` `/oauth/revocation` の全てをDB lookup化

完了条件:
- env固定client依存を撤去しDB解決で動作

### Task 4: Service + Admin API追加
対象:
- 追加: `apps/idp-server/src/modules/oauth-clients/oauth-client.service.ts`
- 追加: `apps/idp-server/src/modules/oauth-clients/oauth-client.routes.ts`
- 更新: `apps/idp-server/src/core/app-context.ts`
- 更新: `apps/idp-server/src/composition/create-services.ts`
- 更新: `apps/idp-server/src/composition/create-app-dependencies.ts`
- 更新: `apps/idp-server/src/app.ts`

新規API（admin）:
- `GET /v1/admin/oauth/clients`
- `POST /v1/admin/oauth/clients`
- `PUT /v1/admin/oauth/clients/{clientId}`
- `POST /v1/admin/oauth/clients/{clientId}/rotate-secret`
- `POST /v1/admin/oauth/clients/{clientId}/disable`
- `POST /v1/admin/oauth/clients/{clientId}/enable`

完了条件:
- admin権限 + audit記録付きでclient管理が可能

### Task 5: shared schema / OpenAPI / 契約テスト
対象:
- 更新: `packages/shared/src/schemas/admin.ts`
- 更新: `packages/shared/src/index.ts`
- 更新: `docs/openapi.yaml`
- 更新: `apps/idp-server/src/contracts/protected.openapi-contract.test.ts`
- 更新: `apps/idp-server/src/contracts/mfa-oauth-oidc.openapi-contract.test.ts`

内容:
- request/response schema追加
- OpenAPI契約反映
- contract test整備

完了条件:
- `pnpm verify:openapi` と `pnpm verify:contract` が通る

### Task 6: seed / 移行互換
対象:
- 更新: `apps/idp-server/src/seed.ts`
- 更新: `apps/idp-server/src/config/env.ts`
- 更新: `.env.example`
- 更新: `README.md`

内容:
- 開発用default clientをDB seedで作成
- 移行期間中のみenv fallbackを許可する方針を明記
- fallback撤去期限を設定（例: 2026-06-30）

完了条件:
- 新規環境でseed後すぐOAuth endpointが利用可能

## 8. API契約（最低要件）
### 8.1 Create client request
- `name`
- `clientType`
- `tokenEndpointAuthMethod`
- `redirectUris[]`
- `allowedScopes[]`
- `accessTokenTtlSeconds?`
- `refreshTokenTtlSeconds?`

### 8.2 Create/Rotate response
- `clientId`
- `clientSecret`（このレスポンスでのみ平文表示）
- `secretHint`
- `graceUntil?`

### 8.3 エラールール
- 400: schema違反
- 401: admin認証失敗 / OAuth client認証失敗
- 403: admin権限不足
- 409: `client_id` 重複、状態競合
- 422: redirect URI / scope のポリシー違反

## 9. ロールアウト計画
### Phase A（導入）
- DBテーブルと repository を追加
- OAuth endpoint は env + DB の dual-read（DB優先）

### Phase B（切替）
- seedでdefault client投入
- admin API経由で実clientを作成
- 運用環境のclient切替

### Phase C（クリーンアップ）
- env fallback 削除
- `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` を非推奨から削除へ

## 10. テストマトリクス
1. client auth
- 正常な client_id/secret で200
- disabled clientで401
- revoked/expired secretで401
- grace期間内旧secretで200

2. admin API
- create/update/disable/enable/rotate の200
- 権限なし403
- 重複client_id 409

3. redirect URI / scope
- allowlistにない redirect URI 422
- 未許可scope要求時の拒否

4. 監査
- client作成/更新/停止/rotation が `security_events` と `oauth_client_audit_logs` に記録

## 11. 検証コマンド
```bash
pnpm db:migrate
pnpm db:seed
pnpm --filter @idp/idp-server test
pnpm --filter @idp/idp-server test:contract
pnpm verify:openapi
pnpm verify
```

## 12. リスクと対策
- リスク: secret平文漏洩
  - 対策: 生成時1回のみ返却、以降はhintのみ表示
- リスク: 移行中の認証断
  - 対策: dual-read + ロールバック手順
- リスク: client設定ミスで障害
  - 対策: status=`disabled` 作成→確認後 `enable` の運用

## 13. 実行順（そのまま着手可能）
1. Task1（schema/migration）
2. Task2（repository）
3. Task3（oauth client auth切替）
4. Task4（service/admin routes）
5. Task5（openapi/contract）
6. Task6（seed/README/env）
7. `pnpm verify`

## 14. 受け入れチェックリスト
- [x] OAuth client registry テーブル作成済み
- [x] OAuth endpoint が DB client auth を使用
- [x] Admin API で client lifecycle 管理可能
- [x] secret rotation + grace期間が機能
- [x] OpenAPIと契約テストが一致
- [x] `pnpm verify` 成功

## 16. 完了報告（2026-04-26）
判定: Completed（移行モード）

実装完了範囲:
1. Client registry のDBテーブル群とmigrationを追加した。
2. OAuth endpoint client auth をDB lookup化した。
3. Admin向け client lifecycle API（作成/更新/停止/有効化/rotate）を追加した。
4. OpenAPIと契約テストを更新し、`pnpm verify` 通過を確認した。
5. seedで開発用default clientが投入される状態にした。

補足（移行モードの残件）:
- OAuth client auth には移行期間のため env fallback が残っている。
- 予定どおり Phase C で fallback を削除すれば最終クリーンアップ完了。

## 15. 優先度
最優先（P1）。
自前IdPとしての差別化と本番運用安定性を同時に押し上げる基盤機能。
