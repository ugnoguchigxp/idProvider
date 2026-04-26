# 12. キャッシュ戦略とDB負荷最適化 実装計画

最終更新: 2026-04-26
ステータス: Planned
優先度: P1

## 1. 目的
`/v1/authorization/check` と `/v1/entitlements/check` の高トラフィック時に、PostgreSQL集中を回避しつつ認可判定の一貫性を維持する。

達成したい状態:
- 認可・エンタイトルメント判定の p95 を 200ms 未満で安定化
- RBAC参照のDBクエリ数を平常時 60%以上削減
- 権限変更後の反映遅延を許容範囲（最大 60 秒）に制御
- キャッシュ障害時も fail-open/fail-closed の方針に沿って安全動作する

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
2. 権限更新時のキャッシュ無効化フローがない
3. キャッシュヒット率とDBオフロード率の運用指標が未定義
4. 高負荷時の段階的ロールアウト手順が未整備

## 3. 完了定義（Definition of Done）
- [ ] RBAC/entitlement 判定にRedisキャッシュが導入される
- [ ] キャッシュキー設計（user/org/group）がドキュメント化される
- [ ] 権限変更時のイベント駆動invalidateが実装される
- [ ] キャッシュ関連メトリクス（hit/miss/error/latency）が収集される
- [ ] 負荷試験でDBクエリ削減率 60%以上を確認する
- [ ] 失敗時フォールバック（Redis障害時のDB直参照）が検証される
- [ ] `pnpm verify` が通る

## 4. スコープ
### 4.1 対象
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

### 4.2 対象外
- PostgreSQLクラスタ構成変更（read replica増設など）
- 認可モデルそのものの再設計（RBAC -> ABAC移行）
- 外部キャッシュ製品への移行

## 5. 設計方針
### 5.1 キャッシュ対象
1. Authorization判定結果
- key例: `rbac:auth:{userId}:{resource}:{action}:{orgId|_}:{groupId|_}`
- TTL: 30秒（短TTL + invalidate併用）

2. Entitlement判定結果
- key例: `rbac:ent:{userId}:{key}:{orgId|_}:{groupId|_}:{quantity|_}`
- TTL: 60秒

3. Authorization snapshot（token生成時）
- key例: `rbac:snapshot:{userId}:{orgId|_}:{groupId|_}`
- TTL: 120秒

### 5.2 無効化戦略
- admin操作で権限・エンタイトルメント更新時に対象ユーザーキーを削除
- 一括反映時は prefix invalidate ではなくバージョンキー方式を優先
  - `rbac:ver:{userId}` をインクリメントし、実キーに組み込む
- TTL切れ依存を補助とし、整合性保証はイベント駆動invalidateで担保

### 5.3 フォールバック
- Redis read失敗時: DB直接参照へフォールバック（サービス継続）
- Redis write失敗時: エラーメトリクス記録のみでリクエストは継続
- 連続Redis障害時: キャッシュ層をfeature flagで一時無効化

## 6. 実装タスク（着手順）
### Task 1: RBACキャッシュ抽象の導入（Day 1-2）
担当: Backend

対象:
- `apps/idp-server/src/modules/rbac/` 配下（新規 `rbac-cache.ts` 想定）
- `apps/idp-server/src/composition/create-services.ts`

内容:
- `RBACCache` interface（get/set/invalidate）を定義
- Redis実装とNoop実装を追加
- `RBACService` へ依存注入

受け入れ条件:
- キャッシュ無効でも既存挙動を壊さず起動・テスト通過

### Task 2: authorization/entitlement 判定のキャッシュ化（Day 2-4）
担当: Backend

対象:
- `apps/idp-server/src/modules/rbac/rbac.service.ts`
- `apps/idp-server/src/modules/rbac/rbac.service.test.ts`

内容:
- `authorizationCheck` / `entitlementCheck` に read-through cache を導入
- key生成をユーティリティ化し衝突を防止
- quantity条件ありの entitlement 判定も別キーで管理

受け入れ条件:
- 同一条件の連続呼び出しでDB呼び出し回数が減るテストを追加

### Task 3: 無効化フック実装（Day 3-5）
担当: Backend

対象:
- `apps/idp-server/src/modules/config/config.routes.ts`
- `apps/idp-server/src/modules/oauth-clients/oauth-client.routes.ts`
- RBAC変更を行うadmin系モジュール

内容:
- 権限/設定変更完了時に対象ユーザー（または組織）のRBACキャッシュをinvalidate
- セキュリティイベントに invalidate情報を付与（監査追跡用）

受け入れ条件:
- 権限変更後60秒以内ではなく「即時」に再判定へ反映される

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
- アラート:
  - miss率急増
  - cache error増加

受け入れ条件:
- 監視で「キャッシュ効いているか」を5分以内に判断できる

### Task 5: 負荷試験・段階ロールアウト（Day 7-10）
担当: Backend + QA + SRE

対象:
- `apps/idp-server/load-tests/scenarios/*`
- デプロイ設定（feature flag）

内容:
- 目標負荷: authorization + entitlement 合計 1000 TPS
- 比較: キャッシュ無効時 vs 有効時でDB query量・p95を測定
- 本番ロールアウト:
  - Phase A: 10%
  - Phase B: 50%
  - Phase C: 100%

受け入れ条件:
- p95 < 200ms、DB query削減率 >= 60%、エラー率悪化なし

## 7. 実行スケジュール（固定日付）
1. 2026-04-27: Task 1 着手（抽象 + DI）
2. 2026-04-28: Task 2 着手（read-through cache）
3. 2026-04-29: Task 2 完了、Task 3 着手（invalidate）
4. 2026-04-30: Task 3 完了、Task 4 着手（metrics/alert）
5. 2026-05-01: Task 4 完了、レビュー
6. 2026-05-04: Task 5 開始（load test + tuning）
7. 2026-05-08: 本番100%反映、運用移管

## 8. テストマトリクス
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

## 9. ロールアウト方針
- Feature flag `RBAC_CACHE_ENABLED` を導入
- 本番は 10% -> 50% -> 100% の段階展開
- 各段階で30分以上のメトリクス観測を必須化

## 10. ロールバック戦略
- エラー率悪化時は `RBAC_CACHE_ENABLED=false` で即時切り戻し
- invalidate異常時はTTL短縮（30秒以下）で暫定運用
- Redis障害長期化時はWAF/レート制限を強化しDB保護を優先

## 11. 検証コマンド
```bash
pnpm --filter @idp/idp-server test
pnpm --filter @idp/idp-server test -- rbac
pnpm verify
```

## 12. 実行チェックリスト
- [ ] `RBACCache` 実装（Redis + Noop）
- [ ] `RBACService` の read-through cache 化
- [ ] 権限変更時 invalidate 実装
- [ ] キャッシュ監視メトリクス追加
- [ ] 1000 TPS負荷試験レポート作成
- [ ] 段階ロールアウト完了
- [ ] `pnpm verify` 通過
