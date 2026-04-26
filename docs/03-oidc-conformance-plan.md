# OAuth/OIDC Conformance強化計画（実行可能版）

最終更新: 2026-04-26

## 1. 目的
本プロジェクトのIdP実装を、外部クライアントが安全かつ予測可能に接続できるレベルまで標準互換化する。

達成したい状態:
- OpenID Connect Discovery / JWKS / Token lifecycle が契約どおり動作する
- OAuth2のクライアント認証・トークン更新・失効・イントロスペクションが再現可能に検証される
- 「未対応仕様」が明文化され、導入判断時に誤解がない

## 2. 完了定義（Definition of Done）
以下をすべて満たした時点で本計画は完了。

- `apps/idp-server` に OIDC/OAuth conformanceテスト群が追加され、`pnpm verify` で実行される。
- Discovery/JWKS/`/oauth/token`/`/oauth/revocation`/`/oauth/introspection` の主要正常系・エラー系が自動検証される。
- redirect URI / client auth / PKCE 必須化の挙動をテストで固定する。
- ID Token claims（標準 + 拡張）の内容と仕様差分を `docs/oidc-compatibility.md` に記載する。
- 未対応仕様（例: dynamic client registration, PAR/JAR など）が明示される。

## 3. スコープ
### 3.1 対象
- `apps/idp-server/src/core/oidc-provider.ts` の設定・claims挙動
- `apps/idp-server/src/app.ts` の discovery/jwks 公開挙動
- `apps/idp-server/src/modules/auth/auth.routes.ts` の OAuth endpoint挙動
- OpenAPI契約 (`docs/openapi.yaml`) と実装の整合
- conformance用ドキュメント整備

### 3.2 対象外
- OpenID Foundation公式 conformance suiteの本番環境運用
- Dynamic Client Registration 実装
- Device Flow, CIBA, PAR/JAR/FAPI full対応
- 外部監査レポート作成

## 4. 現状サマリ（2026-04-26）
### 4.1 実装済み
- `oidc-provider` を利用した基本構成
- PKCE required 設定
- introspection/revocation 有効化
- OAuth client basic auth（token/introspection/revocation）
- Discovery/JWKS 公開
- OIDC claims拡張（permissions/entitlements）

### 4.2 不足/曖昧
- OIDC authorization code flow のエンドツーエンド検証が不足
- redirect URIエラー系の網羅テスト不足
- ID Token claimsの標準/独自境界が文書化不足
- OpenID conformance suite実施Runbookの整備が必要

## 5. 成果物
- `docs/03-oidc-conformance-plan.md`（本書）
- `docs/oidc-compatibility.md`（新規）
- `apps/idp-server/src/core/oidc-provider.conformance.test.ts`（新規）
- `apps/idp-server/src/modules/auth/oauth.conformance.test.ts`（新規）
- `.github/workflows/oidc-conformance.yml`（新規）
- `scripts/verify-oidc-conformance.sh`（新規）
- `docs/openid-conformance-suite-runbook.md`（新規）
- 必要に応じて `docs/openapi.yaml` 更新

## 6. 実装方針
1. まず内部 conformance テストを Vitest で固定する（CI実行可能）。
2. 仕様差分は必ず `docs/oidc-compatibility.md` に残す。
3. 本番向けでない設定（`devInteractions` など）は環境依存で明示分離する。
4. 変更は「仕様」「実装」「テスト」「ドキュメント」を同時に揃える。

## 7. タスク分解（ファイル単位）
### Task 1: OIDC provider設定 conformanceテスト
対象ファイル:
- 追加: `apps/idp-server/src/core/oidc-provider.conformance.test.ts`
- 参照: `apps/idp-server/src/core/oidc-provider.ts`

実装内容:
- client設定の必須値確認（grant_types/response_types/token_endpoint_auth_method）
- PKCE required=true の確認
- redirect_uris が `OIDC_CLIENT_REDIRECT_URIS` を採用すること
- production時 `devInteractions` が無効になること

完了条件:
- 上記ケースがテストで固定される

### Task 2: OAuth endpoint conformanceテスト
対象ファイル:
- 追加: `apps/idp-server/src/modules/auth/oauth.conformance.test.ts`
- 参照: `apps/idp-server/src/modules/auth/auth.routes.ts`, `apps/idp-server/src/app.ts`

実装内容:
- `/oauth/token`
  - 200: `OAuthTokenResponse` 形式
  - 401: client auth不正
  - 429: rate limit
- `/oauth/introspection`
  - 200: active/inactive分岐
  - 401: client auth不正
  - 429: rate limit
- `/oauth/revocation`
  - 200: accepted
  - 401: client auth不正
  - 429: rate limit

完了条件:
- endpointごとの正常/異常系がテストで固定される

### Task 3: Discovery/JWKS conformance強化
対象ファイル:
- 更新: `apps/idp-server/src/app.test.ts`
- 参照: `apps/idp-server/src/app.ts`

実装内容:
- Discovery/JWKSの200レスポンス検証
- upstream失敗時の502検証（discovery）
- rate limit時の429検証

完了条件:
- discovery/jwks の主要挙動が回帰防止される

### Task 4: claims互換性ドキュメント作成
対象ファイル:
- 追加: `docs/oidc-compatibility.md`
- 参照: `apps/idp-server/src/core/oidc-provider.ts`

記載項目:
- 標準claims: `sub`, `email`, `email_verified`, `name`, `given_name`, `family_name`, `preferred_username`, `locale`, `zoneinfo`, `updated_at`
- 独自claims: `permissions`, `entitlements`
- scopesとclaimsの対応表
- 未対応仕様と理由

完了条件:
- 外部利用者が仕様差分を判断できる

### Task 5: OpenAPI整合
対象ファイル:
- 更新候補: `docs/openapi.yaml`
- 検証: `pnpm verify:openapi`

実装内容:
- OAuth/OIDC endpointのstatusコードとレスポンス整合確認
- 変更があれば契約テストも同時更新

完了条件:
- `pnpm verify:openapi` が通る

### Task 6: OpenID Conformance Suite運用整備
対象ファイル:
- 追加: `docs/openid-conformance-suite-runbook.md`
- 追加: `.github/workflows/oidc-conformance.yml`
- 追加: `scripts/verify-oidc-conformance.sh`

実装内容:
- 内部conformance検証の専用コマンド化 (`pnpm verify:oidc-conformance`)
- 外部suite実行前のprecheckをCI化
- OpenID Certification Portal実施手順と記録テンプレートを明文化

完了条件:
- 実行担当者がRunbookのみでsuite実施に着手できる
- CIで内部conformanceが定期検証される

## 8. テストマトリクス
### 8.1 OAuth/OIDC endpoint
- `POST /oauth/token`: 200 / 401 / 429
- `POST /oauth/introspection`: 200(active) / 200(inactive) / 401 / 429
- `POST /oauth/revocation`: 200 / 401 / 429
- `GET /.well-known/openid-configuration`: 200 / 502 / 429
- `GET /.well-known/jwks.json`: 200 / 429

### 8.2 OIDC provider設定
- PKCE required
- redirect URI採用
- client auth method
- claims構成

## 9. 実装順序（そのまま実行可能）
1. Task1（provider conformance test）
2. Task2（oauth conformance test）
3. Task3（discovery/jwks補強）
4. Task4（compatibility doc）
5. Task5（openapi整合確認）
6. Task6（suite運用整備）
7. `pnpm verify`

## 10. 実行コマンド
```bash
pnpm --filter @idp/idp-server test
pnpm --filter @idp/idp-server test:contract
pnpm verify:openapi
pnpm verify
```

## 11. リスクと対策
- リスク: `oidc-provider`内部仕様依存テストが壊れやすい
  - 対策: public behavior中心に検証し、内部実装依存を避ける
- リスク: 独自claimsが一般OIDCクライアントで誤解される
  - 対策: `docs/oidc-compatibility.md` に「独自claims」明記
- リスク: OpenAPIと実装が乖離
  - 対策: 契約テストとopenapi lintを`verify`で強制

## 12. 受け入れチェックリスト
- [x] conformanceテスト2ファイル追加
- [x] OAuth/OIDC endpointの主要ケースが自動検証
- [x] `docs/oidc-compatibility.md` 作成
- [x] `pnpm verify` 成功
- [x] 未対応仕様の明示
- [x] OpenID Conformance Suite実施Runbook作成
- [x] OIDC conformance専用CIワークフロー追加

## 13. 優先度
高。外部連携の失敗率と自前IdPの信頼性に直結する。
