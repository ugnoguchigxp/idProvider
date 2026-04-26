# 12. キャッシュ戦略とDB負荷最適化 実装計画

最終更新: 2026-04-26
ステータス: Planned（Gate Review Required）
優先度: P1

## 1. 目的
`/v1/authorization/check` と `/v1/entitlements/check` の高トラフィック時に、PostgreSQL集中を回避しつつ認可判定の一貫性を維持する。

達成したい状態:
- 認可・エンタイトルメント判定の p95 を 200ms 未満で安定化
- RBAC参照のDBクエリ数を平常時 60%以上削減
- 権限変更後の反映遅延を最大 60 秒以内に制御
- Redis障害時も認可APIを継続提供する

## 2. 現状整理（2026-04-26）
### 2.1 実装済み
- Redis接続基盤は稼働済み（rate limiter / WebAuthn で利用）
- `RBACService` は `RBACRepository` 経由で都度DB判定
  - `apps/idp-server/src/modules/rbac/rbac.service.ts`
  - `apps/idp-server/src/modules/rbac/rbac.repository.ts`
- 認可APIは既存ルートで提供済み
  - `POST /v1/authorization/check`
  - `POST /v1/entitlements/check`
- メトリクス基盤（`prom-client`）が導入済み

### 2.2 ギャップ
1. RBAC判定に専用キャッシュがない
2. 権限更新時の無効化トリガーが未定義
3. ベースライン（導入前 p95 / DBクエリ数）が未計測
4. 段階ロールアウトと切り戻し条件が曖昧

## 3. 適用判断ゲート（Go/No-Go）
### Gate 0: 実装着手前に必須
- [ ] 無効化トリガーを固定する（どの操作が invalidate を発火するか）
- [ ] Redis障害時フォールバックを固定する（DB直参照で継続）
- [ ] ロールアウト制御フラグを定義する（`RBAC_CACHE_ENABLED`）
- [ ] 導入前ベースラインを採取する（p95 / DBクエリ数 / エラー率）
- [ ] 負荷試験条件を固定する（同一シナリオで比較可能）

Go条件:
- 上記5項目が文書化され、Backend/SRE合意済み

No-Go条件:
- invalidate対象操作が未確定
- Redis障害時の挙動が未確定

## 4. 完了定義（Definition of Done）
- [ ] RBAC/entitlement 判定にRedisキャッシュが導入される
- [ ] キャッシュキー設計（user/org/group）が文書化される
- [ ] 権限変更時のイベント駆動invalidateが実装される
- [ ] キャッシュ関連メトリクス（hit/miss/error/latency）が収集される
- [ ] 負荷試験でDBクエリ削減率 60%以上を確認する
- [ ] Redis障害時のDBフォールバックを検証する
- [ ] `pnpm verify` が通る

## 5. スコープ
### 5.1 対象
- `apps/idp-server/src/modules/rbac/rbac.service.ts`
- `apps/idp-server/src/modules/rbac/rbac.repository.ts`
- `apps/idp-server/src/modules/rbac/rbac.service.test.ts`
- `apps/idp-server/src/modules/rbac/rbac.repository.test.ts`
- `apps/idp-server/src/core/metrics.ts`
- `apps/idp-server/src/composition/create-services.ts`
- `apps/idp-server/src/core/app-context.ts`
- `docs/12-cache-strategy-db-optimization-plan.md`
- `docs/alerts/critical-alert-rules.md`
- `docs/dashboards/idp-reliability-dashboard.md`

### 5.2 対象外
- PostgreSQLクラスタ構成変更（read replica増設など）
- 認可モデルそのものの再設計（RBAC -> ABAC移行）
- 外部キャッシュ製品への移行

## 6. 設計方針
### 6.1 キャッシュ対象
1. Authorization判定結果
- key例: `rbac:auth:{userId}:{resource}:{action}:{orgId|_}:{groupId|_}`
- TTL: 30秒（短TTL + invalidate併用）

2. Entitlement判定結果
- key例: `rbac:ent:{userId}:{key}:{orgId|_}:{groupId|_}:{quantity|_}`
- TTL: 60秒

3. Authorization snapshot（token生成時）
- key例: `rbac:snapshot:{userId}:{orgId|_}:{groupId|_}`
- TTL: 120秒

### 6.2 無効化トリガー（本プロジェクト向け）
- ロール/権限割当更新（`user_roles`, `group_roles`, `role_permissions` 変更時）
- entitlement変更（`entitlements` 更新時）
- SoD導入で追加される管理ロール更新API

### 6.3 フォールバック
- Redis read失敗時: DB直接参照へフォールバック（サービス継続）
- Redis write失敗時: エラーメトリクス記録のみで処理継続
- Redis障害継続時: `RBAC_CACHE_ENABLED=false` でキャッシュ層を無効化

## 7. 実装タスク（着手順）
### Task 0: Gate 0完了（Day 0）
担当: Tech Lead + Backend + SRE

対象:
- 本ドキュメント

内容:
- Gate 0チェック完了とGo/No-Go判定記録
- ベースライン計測結果を保存

受け入れ条件:
- Go判定記録とベースライン値が残る

### Task 1: RBACキャッシュ抽象の導入（Day 1-2）
担当: Backend

対象:
- `apps/idp-server/src/modules/rbac/` 配下（新規 `rbac-cache.ts`）
- `apps/idp-server/src/composition/create-services.ts`

内容:
- `RBACCache` interface（get/set/invalidate）を定義
- Redis実装とNoop実装を追加
- `RBACService` へ依存注入

受け入れ条件:
- キャッシュ無効でも既存挙動を壊さず起動・テスト通過

### Task 2: 判定系のキャッシュ化（Day 2-4）
担当: Backend

対象:
- `apps/idp-server/src/modules/rbac/rbac.service.ts`
- `apps/idp-server/src/modules/rbac/rbac.service.test.ts`

内容:
- `authorizationCheck` / `entitlementCheck` に read-through cache を導入
- key生成ユーティリティを追加して衝突を回避
- quantity条件ありの entitlement 判定も別キー化

受け入れ条件:
- 同一条件の連続呼び出しでDB呼び出し回数が減る

### Task 3: invalidate実装（Day 3-5）
担当: Backend

対象:
- RBAC/entitlement 更新を行うサービス層
- 関連管理ルート（SoD対応時に更新）

内容:
- Task 0で確定したトリガーで invalidate を発火
- 監査用に invalidate結果をログへ残す

受け入れ条件:
- 権限変更後に即時再判定へ反映される

### Task 4: メトリクス・アラート追加（Day 4-6）
担当: Backend + SRE

対象:
- `apps/idp-server/src/core/metrics.ts`
- `docs/alerts/critical-alert-rules.md`
- `docs/dashboards/idp-reliability-dashboard.md`

内容:
- 指標追加:
  - `idp_rbac_cache_hit_total`
  - `idp_rbac_cache_miss_total`
  - `idp_rbac_cache_error_total`
  - `idp_rbac_cache_latency_seconds`
- miss率増加・error増加のアラート定義

受け入れ条件:
- 5分以内にキャッシュ有効性を判断できる

### Task 5: 負荷試験・段階ロールアウト（Day 7-10）
担当: Backend + QA + SRE

対象:
- `apps/idp-server/load-tests/scenarios/*`
- デプロイ設定（feature flag）

内容:
- 導入前/導入後を同一シナリオで比較
- 目標負荷: authorization + entitlement 合計 1000 TPS
- 本番ロールアウト:
  - Phase A: `warn-only`（計測のみ）
  - Phase B: 50%
  - Phase C: 100%

受け入れ条件:
- p95 < 200ms、DB query削減率 >= 60%、エラー率悪化なし

## 8. 実行スケジュール（固定日付）
1. 2026-04-27: Task 0（Gate 0判定 + ベースライン採取）
2. 2026-04-28: Task 1 着手（抽象 + DI）
3. 2026-04-29: Task 2 着手（read-through cache）
4. 2026-04-30: Task 2 完了、Task 3/4 着手
5. 2026-05-01: Task 3/4 完了
6. 2026-05-04: Task 5 開始（負荷試験 + warn-only）
7. 2026-05-08: 100%反映完了

## 9. テストマトリクス
1. 機能
- cache miss時にDB参照して結果を返す
- cache hit時にDB参照なしで同値結果を返す

2. 整合性
- 権限更新直後にinvalidateされ最新判定になる
- quantity付き entitlement の閾値判定が壊れない

3. 障害
- Redis停止時でも認可APIが500にならず継続動作
- cache write失敗時にメトリクス記録のみで処理継続

4. 性能
- 1000 TPSで p95 < 200ms
- DBクエリ削減率 60%以上

## 10. ロールアウト方針
- Feature flag `RBAC_CACHE_ENABLED` を導入
- 1段階目: `warn-only`（判定差分と指標収集）
- 2段階目: 50%適用
- 3段階目: 100%適用

進行停止条件:
- エラー率が導入前比で悪化
- miss率急増でDB負荷が導入前を超過

## 11. ロールバック戦略
- 異常時は `RBAC_CACHE_ENABLED=false` で即時切り戻し
- invalidate不備時はTTL短縮（30秒以下）で暫定運用
- Redis障害長期化時はDB保護を優先し追加レート制限を適用

## 12. 検証コマンド
```bash
pnpm --filter @idp/idp-server test
pnpm --filter @idp/idp-server test -- rbac
pnpm verify
```

## 13. 実行チェックリスト
- [ ] Gate 0完了（Go判定記録）
- [ ] ベースライン測定値の記録
- [ ] `RBACCache` 実装（Redis + Noop）
- [ ] `RBACService` の read-through cache 化
- [ ] invalidateトリガー実装
- [ ] キャッシュ監視メトリクス追加
- [ ] 1000 TPS負荷試験レポート作成
- [ ] 段階ロールアウト完了
- [ ] `pnpm verify` 通過
