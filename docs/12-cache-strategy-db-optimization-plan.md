# 12. キャッシュ戦略とDB負荷最適化 実装計画（Project-Optimized）

最終更新: 2026-04-26  
ステータス: Planned (Implementation-Ready)  
優先度: P1

## 1. 目的
B2Cスパイク時（ログイン集中・認可照会集中）でも、認可判定APIの可用性を落とさずにPostgreSQL read負荷を下げる。

本計画の成功条件:
- `/v1/authorization/check` / `/v1/entitlements/check` の p95 が通常時 200ms 以下
- RBAC/entitlement系のDB readを平常時 50%以上削減
- Redis障害時に認可APIの5xxを増やさない（DBフォールバック）

## 2. このプロジェクト向け設計原則
`docs/b2c-authorization-and-boundary-strategy.md` に合わせ、以下を固定する。

1. B2C優先: 複雑な整合性より「落ちない・速い」を優先
2. IdPコア最小化: 認可判定キャッシュのみを対象。業務ルールエンジン化はしない
3. 段階導入: まずTTL-onlyで成果を出し、invalidateは後段で拡張
4. 運用可能性: feature flagで即時停止可能にする

## 3. スコープ
### 3.1 対象
- `apps/idp-server/src/modules/rbac/rbac.service.ts`
- `apps/idp-server/src/modules/rbac/rbac.repository.ts`
- `apps/idp-server/src/modules/rbac/rbac-cache.ts`（新規）
- `apps/idp-server/src/composition/create-services.ts`
- `apps/idp-server/src/core/metrics.ts`
- `apps/idp-server/src/core/env.ts`
- `apps/idp-server/src/modules/rbac/*.test.ts`
- `docs/perf/*`

### 3.2 対象外
- Tenant境界の再設計
- JSON Policy Engine導入
- Redisクラスタ構成の刷新
- 全APIの汎用キャッシュ化

## 4. 現状前提（2026-04-26）
- Redisは既に稼働（rate limit / WebAuthn 等で利用中）
- 認可チェックは現状ほぼDB直読み
- 観測基盤（`/metrics`）は整備済みで、追加メトリクスの実装が可能
- RBAC更新系は限定的で、invalidate発火点が不足

このため、Phase 1はTTL-onlyを採用する。

## 5. 実装方針（2フェーズ）
### Phase 1: TTL-only Read-through（今回の実装対象）
- 読み取り時に `cache -> missならDB -> cache set`
- positive/negative両方を短TTLで保持
- Redis障害時は即DBフォールバック（fail-open）

### Phase 2: 明示的Invalidate（次段）
- RBAC更新APIが揃った後に、更新イベント起点でinvalidate追加
- 発火点は Plan 13 と接続（別PR）

## 6. 設定値（Env/Flag）
`apps/idp-server/src/core/env.ts` に追加:

- `RBAC_CACHE_ENABLED` (`true|false`, default: `false`)
- `RBAC_CACHE_PERCENT` (`0..100`, default: `0`)
- `RBAC_CACHE_AUTH_TTL_SECONDS` (default: `30`)
- `RBAC_CACHE_ENT_TTL_SECONDS` (default: `60`)
- `RBAC_CACHE_NEGATIVE_TTL_SECONDS` (default: `15`)

適用判定:
- `hash(userId) % 100 < RBAC_CACHE_PERCENT`
- userIdが無い場合は `hash(ip + userAgent + route)` を代替キーに利用

## 7. キー設計
- Authorization: `rbac:v1:auth:{userId}:{resource}:{action}:{orgId|_}:{groupId|_}`
- Entitlement: `rbac:v1:ent:{userId}:{entitlementKey}:{orgId|_}:{groupId|_}:{qty|_}`
- Snapshot（任意）: `rbac:v1:snapshot:{userId}:{orgId|_}:{groupId|_}`

補足:
- key schema変更時は `v2` へ切替
- key長の過大化を避けるため、長い入力はハッシュ化して末尾に付与

## 8. 失敗時ポリシー
1. Redis read失敗: DBへフォールバックし処理継続
2. Redis write失敗: ログ + エラーメトリクスのみ（レスポンスは継続）
3. Redis全断: `RBAC_CACHE_ENABLED=false` で即停止
4. 予期せぬレイテンシ増: `RBAC_CACHE_PERCENT` を段階的に戻す

## 9. 実装タスク（そのまま着手できる粒度）
### Task 0: ベースライン計測（0.5日）
担当: Backend + SRE

実施:
- キャッシュ無効状態で 30分計測
- 取得: p50/p95/p99、RBAC系DB read count、5xx rate

成果物:
- `docs/perf/baseline-rbac-cache-YYYYMMDD.md`

### Task 1: キャッシュ抽象導入（1日）
担当: Backend

実装:
- `rbac-cache.ts` に `RBACCache` interface（get/set/delByPrefix/noop）
- Redis実装とNoop実装を作成
- `create-services.ts` で注入（既存DI方針に合わせる）

完了条件:
- ユニットテストでRedis/Noopの分岐確認

### Task 2: 認可チェック read-through 化（1.5日）
担当: Backend

実装:
- `authorizationCheck` / `entitlementCheck` に cache-first を適用
- negative cache（deny結果）を短TTLで保持
- percentage rollout判定を実装

完了条件:
- hit時にDB呼び出しゼロをテストで保証

### Task 3: メトリクス追加（0.5日）
担当: Backend

追加メトリクス:
- `idp_rbac_cache_hit_total{type="auth|ent"}`
- `idp_rbac_cache_miss_total{type="auth|ent"}`
- `idp_rbac_cache_error_total{operation="get|set|del"}`
- `idp_rbac_cache_lookup_duration_seconds{type="auth|ent"}`

完了条件:
- `/metrics` で全指標を確認

### Task 4: 段階ロールアウト（1日）
担当: Backend + SRE

手順:
1. `enabled=true, percent=0`（観測のみ）
2. `percent=25`（30分）
3. `percent=50`（30分）
4. `percent=100`（問題なければ昇格）

停止条件:
- p95がbaseline比20%以上悪化
- cache error急増
- 5xx率増加

### Task 5: 比較レポート作成（0.5日）
担当: Backend + SRE

成果物:
- `docs/perf/rbac-cache-rollout-report-YYYYMMDD.md`
- before/after差分、残課題、Phase 2着手条件を記載

## 10. テスト計画
1. 機能テスト
- miss時にDB照会し、結果がcacheに保存される
- hit時にDB照会しない

2. 異常テスト
- Redis get/set失敗でも200/403を維持（500を出さない）

3. 互換テスト
- cache on/offで判定結果が一致する

4. 負荷テスト（簡易）
- 同一条件照会を連打しhit率が上がること
- DB queryがbaselineより減ること

## 11. リスクと対策
1. stale権限反映遅延
- 対策: TTL短め（auth 30s/ent 60s）+ Phase 2 invalidate

2. key爆発（高cardinality）
- 対策: キー入力を限定し、不要次元を含めない

3. Redis障害連鎖
- 対策: fail-open固定、feature flagで即停止

4. 観測不足
- 対策: hit/miss/errorを必須メトリクスとして先に実装

## 12. DoD
### Phase 1（今回）
- [ ] Task 0-5 完了
- [ ] `pnpm --filter @idp/idp-server test` 通過
- [ ] `pnpm verify` 通過
- [ ] baseline比でDB read削減が確認できる

### Phase 2（次段）
- [ ] 更新系イベント起点invalidateの実装
- [ ] 権限更新反映遅延 <= 60秒

## 13. 実行コマンド
```bash
pnpm --filter @idp/idp-server test -- rbac
pnpm --filter @idp/idp-server test
pnpm verify
```

## 14. 実装開始判定
この計画は **Phase 1を即時着手可能**。  
Phase 2はRBAC更新系APIの実装タイミング（Plan 13）で接続する。
