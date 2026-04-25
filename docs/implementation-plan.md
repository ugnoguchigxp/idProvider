# 実装計画（README ロードマップ詳細化）

最終更新: 2026-04-25
対象: README の以下4項目

- トランザクションの整合性
- JWKS サポート
- 設定の外部化
- OIDC 統合の強化

---

## 0. 計画サマリー

この計画の目的は、既存の動作を壊さずに、認証基盤の一貫性・運用性・監査可能性を引き上げること。

実行順序（確定）:

1. 設定の外部化
2. トランザクション整合性
3. OIDC 統合強化
4. JWKS サポート

理由:

- 先に設定を外出しすることで、後続実装の値依存を減らす
- 次にデータ整合性を固め、状態破損リスクを早期に下げる
- OIDC責務を整理してから、鍵運用（JWKS回転）を最終安定化する

---

## 1. 前提・非対象・依存

前提:

- Node.js 24 LTS / pnpm 10
- PostgreSQL / Redis が利用可能
- `pnpm verify` が品質ゲート

非対象（本計画ではやらない）:

- UI/デザイン刷新
- 課金・請求・プロモーション機能
- 外部監視製品の選定そのもの

依存:

- `apps/idp-server`
- `packages/auth-core`
- `packages/db`
- `docs/openapi.yaml`
- `infra/migrations`

---

## 2. 共通DoD（全EPIC共通）

- 実装PRがマージ可能状態である
- 仕様更新（README + docs）が完了している
- `pnpm verify` が通過している
- 追加した設定値が `.env.example` と `env.ts` に反映されている
- 破壊的変更がある場合、移行手順または互換期間が明記されている

---

## 3. EPIC-A: 設定の外部化

### 3-1. 目標

- セッション寿命・Argon2パラメータ・レート制限を環境変数で制御可能にする
- production で危険なデフォルトを使わない

### 3-2. 追加する環境変数（初版）

- `ACCESS_TOKEN_TTL_SECONDS`
- `REFRESH_TOKEN_TTL_SECONDS`
- `ARGON2_MEMORY_COST`
- `ARGON2_TIME_COST`
- `ARGON2_PARALLELISM`
- `RATE_LIMIT_SIGNUP_PER_MIN`
- `RATE_LIMIT_LOGIN_PER_MIN`
- `MFA_ISSUER`
- `JWKS_ROTATION_INTERVAL_HOURS`
- `JWKS_GRACE_PERIOD_HOURS`

### 3-3. 実装タスク

1. `apps/idp-server/src/config/env.ts` に schema/既定値/production制約を追加
2. `packages/auth-core/src/auth-service.ts` の固定値を env 依存へ置換
3. `apps/idp-server/src/core/rate-limiter.ts` の閾値を設定注入へ変更
4. `.env.example` / README を更新

### 3-4. 受け入れ基準

- 主要固定値（TTL/Argon2/RateLimit）がコードから削除される
- production で必須値不足時は起動失敗する
- development/test では安全な既定値で起動可能

### 3-5. 検証

- env境界値テスト（最小/最大/不正値）
- 起動時バリデーション失敗テスト

---

## 4. EPIC-B: トランザクション整合性

### 4-1. 対象フロー

- signup
- password reset confirm
- email verify confirm
- google link / unlink
- refresh token rotation

### 4-2. 実装タスク

1. `packages/db` に `withTransaction` を追加
2. `AuthService` の対象メソッドを transaction 化
3. 監査ログ/セキュリティイベントを同一 transaction 内で記録
4. 競合時の例外を統一マッピング（`400/401/409/500`）

### 4-3. 受け入れ基準

- 中間失敗で partial write が残らない
- refresh競合時に二重発行が起きない
- link/unlink の競合で整合性が崩れない

### 4-4. 検証

- 故障注入（DB更新途中例外）
- 並行テスト（refresh/link 100並行）
- rollback後のDB状態アサーション

---

## 5. EPIC-C: OIDC 統合強化

### 5-1. 目標

- OIDC/OAuth の責務を `oidc-provider` 側に集約し、Hono側の重複実装を解消する
- discovery と実体エンドポイントの不一致をなくす

### 5-2. 実装方針（採用）

- `oidc-provider` 管理エンドポイント: authorization/token/introspection/revocation/jwks/discovery
- Hono 管理エンドポイント: signup/login/session/rbac/password/mfa/google-link

### 5-3. 実装タスク

1. `apps/idp-server/src/app.ts` の OAuthエンドポイント責務を整理（二重定義排除）
2. discovery のソースを `oidc-provider` metadata に統一
3. `docs/openapi.yaml` で provider-managed と app-managed を明示
4. adapterルール文書に OIDC例外を追記

### 5-4. 受け入れ基準

- discovery に載るURLが実際に疎通する
- OAuth endpoint の実装が単一責務になる
- OpenAPI と実装差分がゼロになる

### 5-5. 検証

- auth code + PKCE E2E
- introspection/revocation のクライアント認証E2E
- discovery consistency テスト

---

## 6. EPIC-D: JWKS サポート（配信・回転・失効）

### 6-1. 目標

- `/.well-known/jwks.json` で有効鍵を配信
- `kid` ローテーションを無停止で自動実行
- 緊急失効を手順化

### 6-2. 実装タスク

1. `packages/auth-core` に KeyStore サービスを追加
2. `signing_keys` から公開対象鍵を抽出するロジック実装
3. 回転ジョブ実装（新鍵追加 → grace期間 → 旧鍵retire）
4. 緊急失効コマンド追加（Runbook併記）
5. `oidc-provider` 署名鍵設定を KeyStore 経由に統一

### 6-3. 受け入れ基準

- 新旧 `kid` の共存期間が保証される
- retire後に旧鍵が JWKS から除外される
- 緊急失効手順で5分以内に配信状態を切替可能

### 6-4. 検証

- T0/T+grace/T+retire の時系列シミュレーション
- JWT検証クライアント互換テスト（旧鍵期間中）

---

## 7. マイルストーン（目安）

- M1（1週間）: EPIC-A 完了
- M2（2週間）: EPIC-B 完了
- M3（3週間）: EPIC-C 完了
- M4（4週間）: EPIC-D 完了

注記: 実際の期間はレビュー待ち・障害対応で変動するため、週次で見直す。

---

## 8. リスクと対策

- リスク: OIDC責務変更で既存クライアント互換が崩れる
- 対策: 互換期間を設け、旧経路を段階的に廃止

- リスク: 鍵回転時のキャッシュ遅延で検証失敗
- 対策: grace期間を十分に取り、`Cache-Control` を明示

- リスク: transaction 導入でレイテンシ悪化
- 対策: 対象処理を限定し、性能計測を追加

---

## 9. 変更管理（運用）

- 各EPIC着手前に `Design Note` を短文で作成
- リリース時は `migration note` と `rollback 手順` を必須化
- 重大変更は feature flag で段階有効化

---

## 10. チケット分割（実行テンプレート）

- EPIC-A: Config Externalization
- EPIC-B: Transaction Safety
- EPIC-C: OIDC Integration Simplification
- EPIC-D: JWKS Rotation Pipeline

各EPICに最低限含めるチケット:

1. 実装
2. テスト
3. ドキュメント更新
4. verifyゲート通過
