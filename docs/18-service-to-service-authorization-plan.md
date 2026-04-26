# 18. サービス間認可強化 実装計画

最終更新: 2026-04-26
ステータス: Planned（Design-Ready）
優先度: P0

## 1. 目的
マイクロサービス間通信で、トークン検証と認可判定を一貫して適用し、サービス境界のセキュリティを強化する。

達成したい状態:
- すべての内部サービスが同一方式でJWT検証できる
- `authorization/check` と `entitlements/check` の高トラフィック運用に耐える
- サービス間の権限逸脱を監査で追跡できる

## 2. 現状整理（2026-04-26）
### 2.1 実装済み
- `POST /v1/authorization/check`
- `POST /v1/entitlements/check`
- RBACキャッシュ基盤（初期実装）

### 2.2 ギャップ
1. サービスごとのJWT検証実装が標準化されていない
2. entitlement判定のキャッシュ戦略が運用ルールまで定義されていない
3. サービス間権限失敗のメトリクスが不足

## 3. スコープ
### 3.1 対象
- `apps/idp-server/src/modules/rbac/*`
- `apps/idp-server/src/modules/sessions/*`
- `apps/idp-server/src/core/tokens.ts`
- `packages/server-sdk/*`
- `docs/b2c-authorization-and-boundary-strategy.md`
- `docs/dashboards/idp-security-dashboard.md`
- `docs/dashboards/idp-reliability-dashboard.md`

### 3.2 対象外
- マルチクラスタを跨ぐグローバルキャッシュ最適化
- ABAC完全移行

## 4. 実装フェーズ
### Phase 1: 検証ライブラリ統一
- `packages/server-sdk` でJWT検証ミドルウェアを標準化
- 失敗理由を構造化ログへ統一出力

### Phase 2: 認可判定高速化
- authorization/entitlement判定のキャッシュキー戦略を固定
- 強制失効時のキャッシュ破棄導線を整備

### Phase 3: 観測と統制
- 認可失敗率、キャッシュヒット率、判定遅延を可視化
- 異常増加時アラートを追加

## 5. タスク
### Task 1: JWT検証標準化（Day 0-3）
担当: Backend

### Task 2: 判定キャッシュ方針固定（Day 3-5）
担当: Backend + SRE

### Task 3: 監視/アラート拡張（Day 5-7）
担当: SRE + Security

## 6. 完了定義（Definition of Done）
- [ ] 3つ以上の内部サービスで同一ミドルウェア利用
- [ ] 認可判定のp95を計測し、目標値を定義
- [ ] 認可失敗の監査・アラート導線がある
- [ ] `pnpm verify` が通る

## 7. 検証コマンド（予定）
```bash
pnpm verify
pnpm --filter @idp/idp-server test -- rbac
```

## 8. スケジュール（固定日付）
1. 2026-04-27: Task 1開始
2. 2026-04-30: Task 2開始
3. 2026-05-02: Task 3開始
