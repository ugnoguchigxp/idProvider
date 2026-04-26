# Key Management・Rotation計画（実行可能版）

最終更新: 2026-04-26

## 0. 実装状況（2026-04-26）
- [x] `signing_keys` テーブルで鍵素材を管理している
- [x] 初回起動時に署名鍵を自動生成する (`ensureKeyExists`)
- [x] 定期ローテーション処理を実装している (`rotateIfDue`)
- [x] JWKSで active + grace期間の鍵を公開している
- [x] 手動ローテーション（admin API）が実装済み
- [x] 緊急失効（compromise）手順と実行APIが実装済み
- [x] KeyStoreの単体/結合テストを追加済み
- [x] 鍵運用Runbook（漏洩対応）を整備済み

## 1. 目的
JWT/JWKS署名鍵の生成、保管、公開、ローテーション、失効、復旧を本番運用可能な水準にする。

達成したい状態:
- 平常時: 自動ローテーション + 互換期間を安全に維持
- 緊急時: compromise を即時封じ込めできる
- 監査時: 鍵ライフサイクルを説明可能

## 2. 完了定義（Definition of Done）
以下をすべて満たした時点で完了。

- 手動ローテーションと緊急失効の実行経路（admin APIまたはCLI）がある。
- `signing_keys` の状態遷移（active / grace / revoked）がコードとRunbookで一貫している。
- JWKS公開キー集合と検証互換期間の整合方針が設定/Runbookで明示される。
- 鍵管理イベントが `security_events` または専用監査テーブルへ記録される。
- KeyStore系の unit/integration テストが追加され `pnpm verify` が通る。
- 漏洩時の緊急手順（判断基準・封じ込め・復旧・連絡）が `docs/` に整備される。

## 3. スコープ
### 3.1 対象
- `packages/auth-core/src/key-store-service.ts`
- `packages/db/src/schema.ts`（必要なら状態列/監査列拡張）
- `apps/idp-server/src/app.ts` / `apps/idp-server/src/index.ts`（起動時ローテーション挙動）
- admin操作経路（新規 route / CLI）
- Runbook と検証手順

### 3.2 対象外
- HSM/KMSの本実装切替（今回は抽象化設計まで）
- OpenID Certificationの鍵管理要件認証申請
- 外部SIEM連携の実装

## 4. 現状ギャップ
1. 自動ローテーションはあるが、手動・緊急オペレーション経路がない。
2. 鍵ライフサイクルを確認する運用面（一覧/履歴/理由記録）が弱い。
3. 鍵管理テストが不足して回帰検知が弱い。
4. compromise時の封じ込め手順がドキュメント化されていない。

## 5. 目標状態
### 5.1 鍵状態モデル
- `active`: 署名に利用される現行鍵
- `grace`: 新規署名には使わないがJWKSで公開し検証互換を維持
- `revoked`: JWKS非公開、監査上のみ保持

### 5.2 運用操作
- Scheduled Rotation: 既存 `rotateIfDue`
- Manual Rotation: 任意タイミングでactive切替
- Emergency Rotation: 旧activeを即時revokeして新active作成
- Key Health Check: active鍵の存在とJWKS整合を検証

## 6. データモデル方針
既存 `signing_keys` を拡張して状態管理を強化する。

推奨追加列:
- `revoked_at` timestamptz nullable
- `rotation_reason` varchar(64) nullable (`scheduled` / `manual` / `emergency`)
- `rotated_by` uuid nullable（admin実行者）

補足:
- 現状 `is_active` + `expires_at` で暗黙状態を表現しているため、`revoked_at` を明示追加して監査説明を改善する。

## 7. 実装タスク（ファイル単位）
### Task 1: KeyStore状態遷移の明確化
対象:
- 更新: `packages/auth-core/src/key-store-service.ts`
- 更新: `packages/db/src/schema.ts`
- 追加: `infra/migrations/0007_extend_signing_keys_lifecycle.sql`

内容:
- `rotateScheduled()` / `rotateManual()` / `rotateEmergency()` を明確化
- revoke状態 (`revoked_at`) を導入
- JWKS取得時に `revoked_at IS NULL` を強制

完了条件:
- 状態遷移がコード上で明示される

### Task 2: 実行経路（admin API or CLI）
対象:
- 追加: `apps/idp-server/src/modules/keys/keys.routes.ts`
- 更新: `apps/idp-server/src/app.ts`
- 更新: `apps/idp-server/src/index.ts`（scheduled rotationイベント記録）

内容:
- `POST /v1/admin/keys/rotate`（manual）
- `POST /v1/admin/keys/rotate-emergency`（emergency）
- `GET /v1/admin/keys`（状態一覧）

完了条件:
- admin権限で手動/緊急ローテーションを実行できる

### Task 3: 監査イベント整備
対象:
- 更新: `apps/idp-server/src/modules/keys/keys.routes.ts`
- 更新: `apps/idp-server/src/index.ts`
- 更新: `docs/security-event-catalog.md`

イベント例:
- `key.rotation.scheduled`
- `key.rotation.manual`
- `key.rotation.emergency`
- `key.revoked`

完了条件:
- 主要鍵操作が監査可能

### Task 4: テスト整備
対象:
- 追加: `packages/auth-core/src/__tests__/key-store-service.test.ts`
- 追加: `apps/idp-server/src/modules/keys/keys.test.ts`
- 更新: `apps/idp-server/src/app.test.ts`（JWKS挙動）

内容:
- scheduled/manual/emergency の状態遷移
- JWKS公開鍵の包含条件
- emergency時の旧鍵除外

完了条件:
- 鍵管理の主要分岐が回帰防止される

### Task 5: OpenAPI/運用Runbook
対象:
- 更新: `docs/openapi.yaml`
- 追加: `docs/key-compromise-runbook.md`
- 更新: `README.md`

内容:
- 管理API契約追加
- 漏洩疑い時の実行手順、連絡フロー、復旧判定を明文化

完了条件:
- 実装と運用ドキュメントが一致

## 8. 仕様ルール
1. 新規署名は常に active key のみ
2. JWKSには active + grace のみ含める
3. emergency rotate 実行時は旧activeを即時 revoke
4. grace期間上限は `max(ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS)` 基準で決定
5. `kid` は再利用禁止

## 9. ロールアウト計画
### Phase A（準備）
- 状態列追加 migration
- KeyStore API拡張

### Phase B（導入）
- admin API/CLI導入
- Runbook配備

### Phase C（本番運用）
- 定期ローテーション監視
- 監査ログ確認フローを運用定着

## 10. テストマトリクス
1. Scheduled rotation
- due前: rotateされない
- due後: new active + old grace

2. Manual rotation
- 実行でactiveが切替
- old keyがgraceへ移行

3. Emergency rotation
- 旧activeが即時revoked
- JWKSから旧activeが除外

4. JWKS整合
- active/graceのみ公開
- revokedは非公開

## 11. 検証コマンド
```bash
pnpm db:migrate
pnpm --filter @idp/auth-core test
pnpm --filter @idp/idp-server test
pnpm verify:openapi
pnpm verify
```

## 12. リスクと対策
- リスク: emergency時の既存token大量失効
  - 対策: runbookに業務影響と告知テンプレートを含める
- リスク: grace期間過不足で検証失敗
  - 対策: TTL連動ルールを固定しテストで検証
- リスク: 運用誤操作
  - 対策: admin権限 + 監査ログ + 実行理由必須

## 13. 実行順（そのまま着手可能）
1. Task1（状態遷移明確化）
2. Task2（実行経路追加）
3. Task3（監査イベント）
4. Task4（テスト）
5. Task5（OpenAPI/Runbook）
6. `pnpm verify`

## 14. 受け入れチェックリスト
- [x] key lifecycle拡張migration追加
- [x] manual/emergency rotate 実行可能
- [x] JWKS公開ルールが仕様どおり
- [x] 鍵管理イベントが監査記録される
- [x] Runbook整備済み
- [x] `pnpm verify` 成功

## 15. 優先度
最優先（P1）。
鍵管理はIdPの信頼境界そのものであり、障害時の復旧難度と監査適合性に直結する。

## 16. 完了報告（2026-04-26）
判定: Completed

実装完了範囲:
1. `signing_keys` のライフサイクル列（`rotation_reason`, `rotated_by`, `revoked_at`）を追加した。
2. KeyStoreに `rotateManual` / `rotateEmergency` / `listKeys` を実装した。
3. admin鍵管理API（一覧/手動rotate/緊急rotate）を追加した。
4. scheduled/manual/emergency/revoked の鍵イベント記録を実装した。
5. OpenAPI・契約テスト・Runbookを追加し、`pnpm verify` 通過を確認した。

漏れ確認結果:
- 05計画のTask 1〜5と受け入れチェックリスト項目は全て実装済み。
- 本計画の対象外（KMS切替、外部SIEM）は未着手だが、スコープ外であることを確認済み。
