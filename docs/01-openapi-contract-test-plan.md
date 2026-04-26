# OpenAPI契約テスト計画（実装完了）

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

## 5. 追加/変更ファイル（実績）
- `apps/idp-server/src/test-utils/openapi-contract.ts`
- `apps/idp-server/src/contracts/helpers.ts`
- `apps/idp-server/src/contracts/public-auth.openapi-contract.test.ts`
- `apps/idp-server/src/contracts/protected.openapi-contract.test.ts`
- `apps/idp-server/src/contracts/mfa-oauth-oidc.openapi-contract.test.ts`
- `apps/idp-server/package.json`（`test:contract`追加）
- ルート`package.json`（`verify:contract`追加、`verify`へ接続）
- `apps/idp-server/src/app.ts`（`/oauth/revocation`のResult unwrap修正）
- `docs/openapi.yaml`（実装に合わせた契約補正）

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

## 7. 実装ステップ（完了）
## Step 0: 事前整備（完了）
- `docs/openapi.yaml`のoperationId/path/statusを現行実装と最終確認
- `oneOf`対象レスポンスを一覧化

完了条件:
- テスト対象endpoint/statusの一覧が確定

## Step 1: validator基盤実装（完了）
- `openapi-contract.ts`を作成
- 実装内容:
  - OpenAPI読み込み
  - dereference
  - `validateResponse({ method, path, status, body, headers? })`
  - 失敗時メッセージ整形（path/method/status/schemaPath/actual）

実績:
- `validateResponseAgainstOpenApi` と `assertJsonResponseMatchesOpenApi` を実装
- 失敗時に `method/path/status/details/body` を出力

## Step 2: matcher実装（完了）
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

実績:
- `src/contracts` の全ケースで helper を共通利用

## Step 3: Public Authへの適用（完了）
- `public-routes.test.ts`と`auth.test.ts`へ導入
- `oneOf`分岐（LoginResponse/MfaRequiredResponse）を個別ケースで固定

実績:
- `src/contracts/public-auth.openapi-contract.test.ts` で Public Auth マトリクスを実装

## Step 4: Protected/MFA/Session/User適用（完了）
- `mfa.test.ts`, `sessions.test.ts`, `users.test.ts`, `config.test.ts`へ適用
- 主要401/403/429契約を追加

実績:
- `src/contracts/protected.openapi-contract.test.ts`
- `src/contracts/mfa-oauth-oidc.openapi-contract.test.ts`

## Step 5: CI統合（完了）
- `apps/idp-server/package.json`に`test:contract`追加
- ルート`package.json`に`verify:contract`追加
- `verify`または`verify:quick`へ組み込み

実績:
- `pnpm verify` フローに `verify:contract` を統合済み

## 8. スクリプト設計
- `apps/idp-server/package.json`
  - `test:contract`: `vitest run src/contracts`
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
- 2026-04-26時点: `69` contract testsがgreen
- 運用ルール:
  - API変更時はOpenAPIと契約テストを同時更新

## 13. この計画の着手コマンド
以下を順に実行すれば、即着手できる。

```bash
pnpm add -D @apidevtools/swagger-parser ajv --filter @idp/idp-server
pnpm --filter @idp/idp-server test
pnpm verify:openapi
```
