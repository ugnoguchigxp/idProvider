# 06. Audit Log完全性・保全 実装計画

最終更新: 2026-04-26
ステータス: Completed
優先度: P1

## 1. 目的
認証・認可・管理操作の証跡を「保存されている」状態から「改ざん検知・追跡・監査提出ができる」状態へ引き上げる。

この計画で達成する状態:
- 重要イベントの欠落を検知できる
- 監査ログ改ざんの検知根拠を持てる
- 期間/actor/action/resource で検索できる
- 監査提出用のエクスポートを再現可能に作成できる

## 2. 現状整理（2026-04-26）
### 2.1 実装済み
- `audit_logs` / `security_events` テーブルは運用中
- `AuditRepository` に `createAuditLog` / `createSecurityEvent` がある
- retention job により匿名化/削除ポリシーは実装済み
- 主要機能で security event の記録は進んでいる

### 2.2 初期ギャップ（着手前）
1. `audit_logs` に改ざん検知用の完全性メタデータがない
2. 監査ログ検索 API（admin）がない
3. 監査ログエクスポート API / バッチがない
4. 「重要操作で audit/security event が必ず記録される」契約テストが不足
5. 監査時の提出フォーマット（manifest/hash）標準がない

## 3. 完了定義（Definition of Done）
- [x] 重要操作の監査イベント網羅表（catalog）が確定
- [x] `audit_logs` に完全性検証用の列が追加される
- [x] 監査検索 API（期間/actor/action/resource/eventType）が提供される
- [x] 監査エクスポート機能（JSONL + manifest hash）が提供される
- [x] 欠落検知テスト（主要ユースケース）が追加される
- [x] retention と完全性検証の整合ルールが文書化される
- [x] `pnpm verify` が通る

## 4. スコープ
### 4.1 対象
- `packages/db/src/schema.ts`
- `infra/migrations/*`（audit log 完全性列追加）
- `apps/idp-server/src/modules/audit/*`
- `apps/idp-server/src/app.ts`（audit routes mount）
- `docs/openapi.yaml`
- `docs/security-event-catalog.md`
- `docs/security-runbook.md`
- `docs/risk-register.md`（R-008 更新）

### 4.2 対象外（09との重複回避）
- SIEM連携やアラート運用の詳細（`09-observability-security-monitoring-plan.md` で扱う）
- 監視ダッシュボード設計
- 外部WORMストレージ導入

## 5. 設計方針
### 5.1 監査データ責務
- `audit_logs`: 業務操作の監査証跡（誰が/何を/対象）
- `security_events`: セキュリティ兆候イベント（検知/異常トリガ）

### 5.2 完全性方式（Phase 1）
`audit_logs` にチェーン情報を追加し、バッチ単位で検証可能にする。

B2C向け運用ポリシー:
- hash chain は `admin.*` 操作ログに限定する。
- 一般ユーザー系の高頻度ログは `integrity_version=0`（非チェーン）で記録し、可用性を優先する。

`integrity_version` の運用値:
- `0`: 非チェーン（B2C高頻度操作、`prev_hash`/`entry_hash` は null）
- `1`: チェーン対象（`admin.*` 操作）

追加候補列:
- `prev_hash` text nullable
- `entry_hash` text nullable（`integrity_version=1` のとき必須）
- `integrity_version` integer not null default 0

ハッシュ計算対象（canonical JSON）:
- `id`, `created_at`, `actor_user_id`, `action`, `resource_type`, `resource_id`, `payload`, `prev_hash`

補足:
- 鍵付き署名は Phase 2（将来）で拡張可能にし、Phase 1 は hash chain で改ざん検知を先行導入

### 5.3 retention整合
- 匿名化更新は「再ハッシュ対象イベント（system.retention.execute）」として記録
- 匿名化/削除によりチェーン断絶が起こるため、日次スナップショット検証結果を別保存して追跡可能にする

## 6. API 設計（admin）
### 6.1 検索
- `GET /v1/admin/audit/logs`
- query:
  - `from`, `to`
  - `actorUserId`
  - `action`
  - `resourceType`
  - `resourceId`
  - `limit`, `cursor`

### 6.2 セキュリティイベント検索
- `GET /v1/admin/audit/security-events`
- query:
  - `from`, `to`, `userId`, `eventType`, `limit`, `cursor`

### 6.3 エクスポート
- `POST /v1/admin/audit/exports`
- body:
  - `from`, `to`
  - `kind: "audit_logs" | "security_events" | "both"`
  - `format: "jsonl"`

レスポンス:
- `exportId`, `status`, `format`, `data`（同期JSONL返却）
- `manifest`（recordCount, sha256）

## 7. 実装タスク（着手順）
### Task 1: イベント網羅表の確定
対象:
- `docs/security-event-catalog.md`
- （必要に応じて）`docs/incident-response-checklist.md`

内容:
- 重要操作の eventType/action マッピングを確定
- 欠落しているイベントの候補を列挙

受け入れ条件:
- 「何が記録対象か」が実装と1対1で対応

### Task 2: DB スキーマ拡張（完全性）
対象:
- `packages/db/src/schema.ts`
- `infra/migrations/0008_audit_log_integrity_chain.sql`（新規）

内容:
- `audit_logs` に `prev_hash`, `entry_hash`, `integrity_version` を追加
- `entry_hash` / `created_at` インデックス追加

受け入れ条件:
- migration 前後で既存データが壊れない
- 新規ログ挿入時に `entry_hash` が必ず保存される

### Task 3: AuditRepository 拡張
対象:
- `apps/idp-server/src/modules/audit/audit.repository.ts`
- `apps/idp-server/src/modules/audit/audit.repository.test.ts`

内容:
- `createAuditLog` で `prev_hash` を読み、`entry_hash` を計算して保存
- ハッシュ計算ヘルパーを追加（canonical serialize）
- `verifyIntegrityRange(from,to)` を追加

受け入れ条件:
- チェーン連結/不整合をテストで再現できる

### Task 4: 監査検索 API
対象:
- `apps/idp-server/src/modules/audit/audit.routes.ts`（新規）
- `apps/idp-server/src/app.ts`
- `apps/idp-server/src/modules/audit/audit.routes.test.ts`（新規）

内容:
- admin 認可付きの検索 API を追加
- cursor pagination と基本フィルタを実装

受け入れ条件:
- 大量データでもページングで取得可能
- 認可なしアクセスは拒否

### Task 5: エクスポート機能
対象:
- `apps/idp-server/src/modules/audit/audit-export.service.ts`（新規）
- `apps/idp-server/src/modules/audit/audit.routes.ts`
- `apps/idp-server/src/modules/audit/audit-export.service.test.ts`（新規）

内容:
- 範囲指定で JSONL 生成
- manifest（sha256, recordCount, generatedAt）生成
- 初期実装は同期レスポンスでJSONL本文を返却（将来、非同期ジョブ + オブジェクトストレージへ拡張）

受け入れ条件:
- 同一入力で同一manifestが再現できる

### Task 6: OpenAPI / Runbook / Risk Register 更新
対象:
- `docs/openapi.yaml`
- `docs/security-runbook.md`
- `docs/risk-register.md`

内容:
- 監査API仕様をOpenAPIへ追加
- 監査提出フロー（検索->検証->エクスポート）をrunbook化
- `R-008` を Accepted -> Mitigated/Closed 判定更新

受け入れ条件:
- ドキュメントと実装の乖離がない

### Task 7: 契約・回帰テスト
対象:
- `apps/idp-server/src/contracts/protected.openapi-contract.test.ts`
- `apps/idp-server/src/contracts/helpers.ts`
- 主要サービスの既存テスト（必要箇所）

内容:
- 新APIの OpenAPI 契約テスト追加
- 重要操作で audit/security event 記録が呼ばれることを検証

受け入れ条件:
- イベント欠落の回帰を CI で検知可能

## 8. テストマトリクス
1. 完全性
- 正常チェーンで `verifyIntegrityRange` が成功
- 1レコード改ざんで検証失敗
- 欠落レコードで検証失敗

2. 検索API
- フィルタ条件で対象が絞り込まれる
- cursor で次ページ取得できる
- admin以外が403になる

3. エクスポート
- 件数/ハッシュが manifest と一致
- 範囲再実行で同一内容が再現される

4. retention整合
- 匿名化/削除後も runbook 記載どおり検証可能

## 9. ロールアウト計画
### Phase A（基盤）
- Task 1-3（catalog確定、DB拡張、repo実装）

### Phase B（API）
- Task 4-5（検索・エクスポート）

### Phase C（運用）
- Task 6-7（OpenAPI/Runbook/Risk/契約テスト）

## 10. ロールバック戦略
- API不具合: audit routes を app mount から外す
- integrity列不具合: 既存列で動作継続しつつ hash列を無効化
- export不具合: 検索APIのみ継続、export endpoint を一時停止

## 11. 検証コマンド
```bash
pnpm db:migrate
pnpm --filter @idp/idp-server test
pnpm verify:openapi
pnpm verify
```

## 12. 実装チェックリスト
- [x] イベント網羅表を確定
- [x] `audit_logs` 完全性列 migration 追加
- [x] AuditRepository の hash chain 実装
- [x] admin監査検索 API 実装
- [x] 監査エクスポート機能 実装
- [x] OpenAPI / Runbook / Risk Register 更新
- [x] 契約テスト + 回帰テスト追加
- [x] `pnpm verify` 通過

## 13. 実装完了サマリ（2026-04-26）
- `audit_logs` に `prev_hash`, `entry_hash`, `integrity_version` を追加し、hash chain 検証基盤を導入。
- admin監査API（logs/security-events/integrity/exports）を追加。
- JSONL export と manifest(sha256, recordCount) 生成を実装。
- OpenAPI・security event catalog・runbook・risk register を更新。
- `pnpm verify` 通過を確認。
- B2C負荷対策として hash chain 適用対象を `admin.*` 操作に限定し、ユーザー系操作でのロック競合を回避。

## 14. 実装反映先（主要ファイル）
- `apps/idp-server/src/modules/audit/audit.repository.ts`
- `apps/idp-server/src/modules/audit/audit.routes.ts`
- `apps/idp-server/src/modules/audit/audit-export.service.ts`
- `packages/db/src/schema.ts`
- `infra/migrations/0008_audit_log_integrity_chain.sql`
- `docs/openapi.yaml`
- `docs/security-event-catalog.md`
- `docs/security-runbook.md`
- `docs/risk-register.md`
