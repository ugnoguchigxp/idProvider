# 10. Backup・DR・Migration 実装計画

最終更新: 2026-04-26
ステータス: Completed
優先度: P1

## 1. 目的
IdP停止・データ破損・migration失敗時に、認証基盤を計画されたRTO/RPO内で復旧できる運用能力を実装する。

達成したい状態:
- 障害時に「何をどこから戻すか」が即断できる
- restore rehearsal を定期運用できる
- migration失敗時に安全な forward-fix / rollback 判断ができる
- DR drill の結果が監査可能な形で記録される

## 2. 現状整理（2026-04-26）
### 2.1 実装済み
- DB schema/migration は `infra/migrations` で管理
- retention/account deletion の定期ジョブが存在
  - `apps/idp-server/src/jobs/data-retention.ts`
  - `apps/idp-server/src/jobs/account-deletion.ts`
- key lifecycle / audit integrity / runbook 系ドキュメントは整備済み

### 2.2 ギャップ
1. バックアップ対象/除外対象の資産台帳が未定義
2. RPO/RTO/SLA の具体値が固定されていない
3. restore rehearsal の標準手順（チェックポイント付き）が未整備
4. migration 前後の運用チェックリストが未整備
5. DR drill の実施記録テンプレートが未整備

## 3. 完了定義（Definition of Done）
- [x] データ分類台帳（Tier1/Tier2/Tier3）が定義される
- [x] Postgres/Redis/Key Material のRPO/RTOが固定される
- [x] restore rehearsal 手順が文書化される
- [x] migration 実行・失敗時対応チェックリストが文書化される
- [x] DR drill テンプレートと初回実施ログが残る
- [x] runbook/incident checklist と相互リンクされる
- [x] `pnpm verify` が通る

## 4. スコープ
### 4.1 対象
- `docs/10-backup-dr-migration-plan.md`
- `docs/security-runbook.md`
- `docs/incident-response-checklist.md`
- `docs/key-compromise-runbook.md`
- `docs/risk-register.md`
- `apps/idp-server/src/jobs/run-data-retention.ts`
- `apps/idp-server/src/jobs/run-account-deletion.ts`
- `infra/migrations/*`

### 4.2 対象外
- クラウドベンダー固有のバックアップ製品比較
- IaC基盤そのものの再設計
- 大規模リージョン間active-active構成への移行

## 5. データ分類・復旧方針
### 5.1 Tier定義
- Tier1（即時復旧必須）
  - `users`, `user_emails`, `user_passwords`, `user_sessions`, `signing_keys`, `oauth_clients*`
- Tier2（短時間で整合復旧）
  - `security_events`, `audit_logs`, `login_attempts`, `mfa_*`
- Tier3（再生成可能）
  - Redis キャッシュ、一時トークン導出キャッシュ

### 5.2 RPO/RTO初期値
- Postgres（Tier1/2）
  - RPO: 5分
  - RTO: 30分
- Redis（Tier3）
  - RPO: 60分（実質再生成）
  - RTO: 15分
- Key Material（`signing_keys`）
  - RPO: 0〜5分（PITR優先）
  - RTO: 15分

### 5.3 B2C前提
- 可用性優先のため、認証不能時間を最小化する復旧順を採用
  1. `signing_keys` と token検証経路
  2. login/session関連
  3. 監査系（追随復旧）

## 6. 実装タスク（着手順）
### Task 1: 資産台帳とRPO/RTO固定
対象:
- `docs/10-backup-dr-migration-plan.md`
- `docs/risk-register.md`

内容:
- データ分類（Tier）と依存関係を明記
- RPO/RTO目標とオーナーを定義

受け入れ条件:
- 主要データセットごとに復旧目標が数値で定義される

### Task 2: Backupポリシー詳細化
対象:
- `docs/10-backup-dr-migration-plan.md`
- 必要に応じて `docs/security-runbook.md`

内容:
- Postgres: full + incremental + PITR前提を文書化
- Redis: 再生成方針と復旧時のウォームアップ手順を明記
- Key material: `signing_keys` 保全要件と復旧優先順を明記

受け入れ条件:
- backup対象/除外対象が明確

### Task 3: Restore Rehearsal手順書
対象:
- `docs/runbooks/restore-rehearsal.md`（新規）
- `docs/incident-response-checklist.md`

内容:
- 手順: スナップショット取得 -> リストア -> 整合確認
- 検証SQL: ユーザー件数、有効session、active key、OAuth client整合
- 成功判定（Acceptance gates）を記載

受け入れ条件:
- 手順だけで第三者がリストア演習を再現できる

### Task 4: Migration実行チェックリスト
対象:
- `docs/runbooks/migration-deploy-checklist.md`（新規）
- `infra/migrations/*`

内容:
- pre-check:
  - 互換性（expand/contract）
  - ロック影響時間見積
  - バックアップ取得確認
- post-check:
  - 主要APIヘルス
  - 参照整合（key/audit/client/session）
- failure時:
  - rollbackではなく forward-fix 優先基準を定義

受け入れ条件:
- migration失敗時の判断フローが固定される

### Task 5: DR Drillテンプレート
対象:
- `docs/dr-drill-template.md`（新規）
- `docs/openid-conformance-records/`（保存先方針記載）

内容:
- drill記録項目:
  - 実施日時、障害シナリオ、検知時刻、復旧時刻
  - 実測RTO/RPO
  - 問題点、改善アクション

受け入れ条件:
- 1回分のdrill記録を残せるテンプレートが完成

### Task 6: ジョブ運用のDR観点補強
対象:
- `apps/idp-server/src/jobs/run-data-retention.ts`
- `apps/idp-server/src/jobs/run-account-deletion.ts`
- `docs/10-backup-dr-migration-plan.md`

内容:
- DR時にジョブを一時停止/再開する手順を明記
- dry-run運用手順と本番切替手順を明記

受け入れ条件:
- 復旧直後に破壊的ジョブが誤起動しない運用手順がある

### Task 7: 検証と監査リンク
対象:
- `docs/security-runbook.md`
- `docs/incident-response-checklist.md`

内容:
- SEV1時の復旧フローに backup/restore 導線を追加
- 06（監査）/09（監視）との相互リンクを追加

受け入れ条件:
- インシデント対応中に参照ドキュメントが分断しない

## 7. 検証マトリクス
1. Backup整合
- スナップショットから単体復元できる
- PITR時点復元で主要テーブル整合が取れる

2. アプリ機能復旧
- `/healthz` `/readyz` が復旧後に正常
- login, refresh, jwks が動作

3. 鍵/監査整合
- active key が1本である
- audit/security event の継続記録が確認できる

4. migration失敗シナリオ
- pre-check未達時に実行中止できる
- 失敗後に forward-fix 手順で復帰できる

## 8. ロールアウト計画
### Phase A（定義）
- Task 1-2: 資産台帳・RPO/RTO・backup方針を固定

### Phase B（手順化）
- Task 3-5: restore/migration/DR drill の手順書を整備

### Phase C（運用定着）
- Task 6-7: ジョブ運用とインシデント導線を統合

## 9. ロールバック戦略
- ドキュメント変更はPR単位で戻せるよう分割
- migration手順変更は旧版チェックリストを履歴保持
- DR drillテンプレートは版管理し、改訂理由を残す

## 10. 検証コマンド
```bash
pnpm db:migrate
pnpm --filter @idp/idp-server test
pnpm verify
```

## 11. 実装チェックリスト
- [x] Tier分類/RPO/RTO 定義
- [x] backup対象・除外対象 定義
- [x] restore rehearsal runbook 作成
- [x] migration deploy checklist 作成
- [x] DR drill template 作成
- [x] 初回DR drill実施ログ 作成
- [x] ジョブ停止/再開手順の明記
- [x] incident/runbook 相互リンク更新
- [x] `pnpm verify` 通過

## 12. 実装状況サマリ（2026-04-26）
- `docs/runbooks/restore-rehearsal.md` を追加し、復旧演習の手順/検証SQL/受け入れ判定を定義した。
- `docs/runbooks/migration-deploy-checklist.md` を追加し、migrationの pre/post/failure 手順を固定した。
- `docs/dr-drill-template.md` を追加し、DR drill記録フォーマットを定義した。
- `docs/dr-drill-records/2026-04-26-drill-001.md` に初回DR drill実施ログ（実測RTO/RPO）を記録した。
- `RETENTION_JOB_ENABLED` / `ACCOUNT_DELETION_JOB_ENABLED` を追加し、DR時の破壊的ジョブ停止を可能にした。
- `docs/security-runbook.md` / `docs/incident-response-checklist.md` / `docs/risk-register.md` にDR導線を反映した。
