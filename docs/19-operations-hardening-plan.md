# 19. 運用完成度（Production Hardening）実装計画

最終更新: 2026-04-26
ステータス: Planned（Implementation-Ready）
優先度: P0

## 1. 目的
シングルテナント構成での本番運用を再現性高く実行できるようにし、運用属人化を解消する。

達成したい状態:
- Helm / Terraform で再現可能なデプロイ手順がある
- 障害復旧手順が定期演習で検証される
- バージョン更新手順とロールバック手順が標準化される

## 2. 現状整理（2026-04-26）
### 2.1 実装済み
- GitHub Actions（CI / deploy-main / nightly）
- DR drill記録とrunbook
- `scripts/deploy-standby.sh`, `scripts/switch-traffic.sh`

### 2.2 ギャップ
1. Kubernetes前提の公式配布（Helm chart）がない
2. IaCテンプレート（Terraform module）が未整備
3. バージョンアップ互換ポリシーが明文化されていない

## 3. スコープ
### 3.1 対象
- `infra/helm/idp/*`（新規）
- `infra/terraform/modules/idp/*`（新規）
- `.github/workflows/*`
- `docs/runbooks/*`
- `docs/14-production-readiness-plan.md`
- `README.md`

### 3.2 対象外
- マルチリージョンactive-active
- 専用クラウドプロバイダ機能への最適化

## 4. 実装フェーズ
### Phase 1: 配布基盤
- Helm chart作成（idp-server / admin-ui / migrations job）
- Terraform module作成（DB, Redis, app runtime前提）

### Phase 2: 運用手順固定
- Upgrade / rollback / key rotation runbook更新
- 監視アラートのしきい値を固定

### Phase 3: 演習自動化
- DR drillチェックリストをCI補助で実行
- 月次演習レポートのテンプレート化

## 5. タスク
### Task 1: Helm chart追加（Day 0-4）
担当: SRE

### Task 2: Terraform module追加（Day 4-8）
担当: SRE + Backend

### Task 3: RunbookとCI統合（Day 8-10）
担当: SRE + Security

## 6. 完了定義（Definition of Done）
- [ ] Helm経由でstaging環境を再現できる
- [ ] Terraformで最小構成を30分以内に構築できる
- [ ] restore/rollback手順が演習で成功する
- [ ] `pnpm verify` が通る

## 7. 検証コマンド（予定）
```bash
pnpm verify
bash ./scripts/verify-standby.sh
```

## 8. スケジュール（固定日付）
1. 2026-04-27: Task 1
2. 2026-05-01: Task 2
3. 2026-05-04: Task 3
