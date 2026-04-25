# OpenAPI契約テスト計画（実行可能版）

## 1. 目的
`apps/idp-server`の実レスポンスが`docs/openapi.yaml`と一致していることをCIで自動検証し、契約破壊をマージ前に検出する。

## 2. 完了定義（Definition of Done）
以下を満たした時点でこの計画は完了。

- `pnpm verify:contract`で`@idp/idp-server`の契約テストが実行される。
- `verify`フローに契約テストが統合される。
- 主要Public/Protected/OAuth/Admin APIの正常系・主要エラー系がOpenAPI schemaで検証される。
- `oneOf`レスポンス（例: login success / mfaRequired）が分岐ケースごとにテストされる。
- 失敗時に「どの path/method/status が不一致か」をテストログで特定できる。

## 3. スコープ
### 対象
- `apps/idp-server`のHTTPレスポンス契約検証
- `docs/openapi.yaml`準拠判定
- CI統合

### 対象外
- OpenAPI仕様そのものの大規模再設計
- SDK生成
- E2Eブラウザテスト
- パフォーマンステスト

## 4. 実装方針
### 方針A（推奨）
既存の`buildApp()`を使うintegration testに、OpenAPIレスポンスvalidatorを組み込む。

- 既存の`app.request()`中心テストを再利用できる。
- 既存mock/deps構成を活かせる。
- 実HTTPレスポンス単位で検証できる。

### 採用ライブラリ
- `@apidevtools/swagger-parser`: OpenAPIのdereference
- `ajv`: JSON schema validation

## 5. 追加/変更ファイル（予定）
- `apps/idp-server/src/test-utils/openapi-contract.ts`
- `apps/idp-server/src/test-utils/openapi-contract.test.ts`（validator単体テスト）
- `apps/idp-server/src/modules/auth/public-routes.test.ts`（契約検証追加）
- `apps/idp-server/src/modules/auth/auth.test.ts`
- `apps/idp-server/src/modules/mfa/mfa.test.ts`
- `apps/idp-server/src/modules/sessions/sessions.test.ts`
- `apps/idp-server/src/modules/users/users.test.ts`
- `apps/idp-server/src/modules/config/config.test.ts`
- `apps/idp-server/package.json`（`test:contract`追加）
- ルート`package.json`（`verify:contract`追加、`verify`へ接続）

## 6. APIテストマトリクス（初期導入）
### Public Auth
- `POST /v1/signup`:
  - 200（production/non-production分岐）
  - 409
  - 429
- `POST /v1/login`:
  - 200 LoginResponse
  - 200 MfaRequiredResponse
  - 401
  - 429
- `POST /v1/login/google`:
  - 200 LoginResponse
  - 200 MfaRequiredResponse
  - 400
  - 403
- `POST /oauth/token`:
  - 200 OAuthTokenResponse
  - 401
- `POST /v1/token/refresh`:
  - 200 TokenRefreshResponse
  - 401
- `POST /v1/email/verify/request`:
  - 200（prod/non-prod）
  - 429
- `POST /v1/email/verify/confirm`:
  - 200
  - 400
- `POST /v1/password/reset/request`:
  - 200
  - 429
- `POST /v1/password/reset/confirm`:
  - 200
  - 400

### Protected/Authz
- `GET /v1/me`: 200, 401
- `POST /v1/password/change`: 200, 401
- `GET /v1/sessions`: 200, 401
- `POST /v1/sessions/revoke`: 200, 401
- `POST /v1/sessions/revoke-all`: 200, 401
- `POST /v1/authorization/check`: 200, 401
- `POST /v1/entitlements/check`: 200, 401

### MFA / WebAuthn
- `POST /v1/mfa/enroll`: 200, 401
- `POST /v1/mfa/verify`: 200, 400
- `GET /v1/mfa/webauthn/register/options`: 200, 401
- `POST /v1/mfa/webauthn/register/verify`: 200, 400
- `POST /v1/mfa/webauthn/authenticate/options`: 200, 429
- `POST /v1/mfa/webauthn/authenticate/verify`: 200, 401, 429
- `POST /v1/mfa/recovery-codes/regenerate`: 200, 400, 401

### Identity/Admin/OAuth
- `POST /v1/identities/google/link`: 200, 401, 403, 409
- `POST /v1/identities/google/unlink`: 200, 401
- `POST /oauth/introspection`: 200, 401
- `POST /oauth/revocation`: 200, 401
- `GET /v1/admin/configs`: 200, 401, 403

## 7. 実装ステップ
## Step 0: 事前整備（0.5日）
- `docs/openapi.yaml`のoperationId/path/statusを現行実装と最終確認
- `oneOf`対象レスポンスを一覧化

完了条件:
- テスト対象endpoint/statusの一覧が確定

## Step 1: validator基盤実装（1日）
- `openapi-contract.ts`を作成
- 実装内容:
  - OpenAPI読み込み
  - dereference
  - `validateResponse({ method, path, status, body, headers? })`
  - 失敗時メッセージ整形（path/method/status/schemaPath/actual）

完了条件:
- validator単体テストが通る

## Step 2: matcher実装（0.5日）
- Vitest custom helperを実装
- 呼び出し例:

```ts
await expectResponseToMatchOpenApi({
  spec,
  method: "POST",
  path: "/v1/login",
  status: res.status,
  body: await res.json(),
});
```

完了条件:
- 既存1テストで契約検証が動く

## Step 3: Public Authへの適用（1日）
- `public-routes.test.ts`と`auth.test.ts`へ導入
- `oneOf`分岐（LoginResponse/MfaRequiredResponse）を個別ケースで固定

完了条件:
- Public Auth契約テストが安定して通る

## Step 4: Protected/MFA/Session/User適用（1.5日）
- `mfa.test.ts`, `sessions.test.ts`, `users.test.ts`, `config.test.ts`へ適用
- 主要401/403/429契約を追加

完了条件:
- 対象endpointの主要ステータスが契約検証される

## Step 5: CI統合（0.5日）
- `apps/idp-server/package.json`に`test:contract`追加
- ルート`package.json`に`verify:contract`追加
- `verify`または`verify:quick`へ組み込み

完了条件:
- `pnpm verify`で契約違反が検出される

## 8. スクリプト設計
- `apps/idp-server/package.json`
  - `test:contract`: `vitest run --dir src/modules --reporter=default`（契約タグ付きテストを含む）
- ルート`package.json`
  - `verify:contract`: `pnpm --filter @idp/idp-server test:contract`
  - `verify`: 既存verifyフローへ`verify:contract`を追加

注記:
- 実コマンドは既存テスト構成に合わせて微調整可。

## 9. レビュー観点
- endpoint pathのtypoがないか
- `oneOf`の分岐を片側だけ検証していないか
- 非production分岐レスポンスを取りこぼしていないか
- ErrorResponseの必須フィールドを検証しているか
- OpenAPI更新時にテストが実際にfailするか

## 10. リスクと対策
- リスク: OpenAPIが厳格化しすぎて既存テストが大量fail
  - 対策: Step 3までを先に通し、段階導入する
- リスク: `oneOf`判定が曖昧で偽陽性
  - 対策: ケースを分けて明示的に判定
- リスク: テスト実行時間増加
  - 対策: 契約テスト対象を主要ケースから拡張

## 11. 切り戻し方針
- validator導入コミットと各モジュール適用コミットを分離
- 問題時はmodule単位で契約検証を一時skip可能にする
- `verify:contract`を独立スクリプトとして維持し、CI反映を段階的に行う

## 12. 成果物
- 契約検証ユーティリティ
- 契約検証付きintegration tests
- CI統合済みverifyフロー
- 運用ルール:
  - API変更時はOpenAPIと契約テストを同時更新

## 13. この計画の着手コマンド
以下を順に実行すれば、即着手できる。

```bash
pnpm add -D @apidevtools/swagger-parser ajv --filter @idp/idp-server
pnpm --filter @idp/idp-server test
pnpm verify:openapi
```
