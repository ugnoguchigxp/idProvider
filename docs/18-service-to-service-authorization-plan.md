# 18. サービス間認可強化 実装計画（実装着手版）

最終更新: 2026-04-26  
ステータス: Implemented（PR-18-01〜03完了）  
優先度: P0

## 1. 目的
シングルテナント前提のまま、複数マイクロサービス/モバイルアプリから共通に使えるサービス間認可基盤を整備する。

達成したい状態:
- サービス間JWT検証を `packages/server-sdk` の共通実装へ統一
- `authorization/check` / `entitlements/check` のキャッシュ方針と失効導線を固定
- 認可失敗・判定遅延・キャッシュヒット率を運用で監視可能

## 2. 現状（コードベース準拠）
### 2.1 既存実装
- API
  - `POST /v1/authorization/check`
  - `POST /v1/entitlements/check`
- 認可実装
  - `apps/idp-server/src/modules/rbac/rbac.routes.ts`
  - `apps/idp-server/src/modules/rbac/rbac.service.ts`
  - `apps/idp-server/src/modules/rbac/rbac.repository.ts`
- メトリクス実装
  - `apps/idp-server/src/core/metrics.ts` (`idp_rbac_cache_*`)
- SDK
  - `packages/server-sdk/src/index.ts`（OIDCクライアント主体、API保護用middlewareは未提供）

### 2.2 主要ギャップ
1. サービス側で使う JWT 検証 middleware が SDK にない
2. キャッシュキー/TTL は実装済みだが失効時の purge 導線が弱い
3. ダッシュボード/アラートが抽象的で運用投入できる粒度でない

## 3. スコープ
### 3.1 対象
- `packages/server-sdk/src/index.ts`
- `packages/server-sdk/src/__tests__/index.test.ts`
- `apps/idp-server/src/modules/rbac/rbac.service.ts`
- `apps/idp-server/src/modules/rbac/rbac.routes.ts`
- `apps/idp-server/src/core/metrics.ts`
- `docs/dashboards/idp-security-dashboard.md`
- `docs/dashboards/idp-reliability-dashboard.md`
- `docs/alerts/critical-alert-rules.md`
- `docs/b2c-authorization-and-boundary-strategy.md`

### 3.2 対象外
- グローバル分散キャッシュ
- ABACフルエンジン化

## 4. 実装方針
### 4.1 SDK標準化（Task 1）
`packages/server-sdk` にサービス保護用ユーティリティを追加する。

追加API（案）:
- `createJwtVerifier(options)`
  - 入力: `issuer`, `audience`, `jwksUri?`, `clockSkewSeconds?`, `fetch?`
  - 出力: `verifyAccessToken(token) -> VerifiedServiceAccessToken`
- `createAuthMiddleware(options)`
  - フレームワーク非依存の `authorize(headers)` 関数を提供
  - 将来の Express/Hono adapter を追加可能な形にする

検証必須クレーム:
- `iss` 一致
- `aud` 一致
- `exp` / `nbf` / `iat` 妥当
- `scope`（必須scope不足時は `insufficient_scope`）

標準エラーコード:
- `missing_token`
- `invalid_token`
- `token_expired`
- `insufficient_scope`

### 4.2 判定高速化（Task 2）
`RBACService` の現行キャッシュ運用を明文化し、失効導線を追加する。

実装ポイント:
- キャッシュキー生成の仕様固定（`userId/resource/action/org/group`）
- 権限更新・セッション失効イベントでのキャッシュ削除 hook 追加
- `entitlement` の negative cache 適用条件を文書化

注記:
- 現時点のコードベースに権限更新APIは未実装のため、失効イベントは `sessions/revoke` と `sessions/revoke-all` を導線として実装する。

### 4.3 観測/統制（Task 3）
既存メトリクスをダッシュボード/アラートに接続する。

必須メトリクス:
- 認可失敗率: `idp_http_requests_total{route="/v1/authorization/check",status="4xx"}`
- 判定遅延(p95): `idp_http_request_duration_seconds`（同route）
- キャッシュヒット率: `idp_rbac_cache_hit_total` / `idp_rbac_cache_miss_total`
- キャッシュ異常: `idp_rbac_cache_error_total`

## 5. 実装ステップ（PR単位）
### PR-18-01: SDK JWT verifier と共通エラー
変更:
- `packages/server-sdk/src/index.ts`
- `packages/server-sdk/src/__tests__/index.test.ts`

受け入れ条件:
- `verifyAccessToken` が署名/期限/audience/scope を検証
- 失敗時に標準エラーコードを返却

検証:
```bash
pnpm --filter @idp/server-sdk test
pnpm --filter @idp/server-sdk typecheck
```

### PR-18-02: RBAC cache purge 導線
変更:
- `apps/idp-server/src/modules/rbac/rbac.service.ts`
- 必要なら `apps/idp-server/src/modules/sessions/*`

受け入れ条件:
- 権限更新・失効時に関連cacheが削除される
- 既存API挙動を壊さない

検証:
```bash
pnpm --filter @idp/idp-server test -- src/modules/rbac
```

### PR-18-03: ダッシュボード/アラート運用化
変更:
- `docs/dashboards/idp-security-dashboard.md`
- `docs/dashboards/idp-reliability-dashboard.md`
- `docs/alerts/critical-alert-rules.md`

受け入れ条件:
- 各パネルに対象メトリクスと判定意図がある
- 主要アラートに閾値・runbook紐付けがある

検証:
- ドキュメントレビュー + synthetic check 実施

## 6. Definition of Done（コードベース準拠）
- [x] `packages/server-sdk` に JWT verifier API が追加される
- [x] `authorization/check` / `entitlements/check` の cache purge 導線がある
- [x] 認可系メトリクスを使った dashboard/alert 文書が更新される
- [x] `pnpm verify` が通る

## 7. 実装開始前チェック（着手ゲート）
- [x] `pnpm verify` が green
- [x] `env` テスト失敗が解消済み
- [ ] PR-18-01 の API シグネチャを確定
- [ ] scope最小セット（例: `service.read`, `service.write`）を確定

## 8. 初手（次アクション）
1. 完了: PR-18-01として `packages/server-sdk` に verifier を追加
2. 完了: `missing_token` / `token_expired` / `insufficient_scope` テストを固定
3. 完了: IdP側 cache purge と監視文書を更新
