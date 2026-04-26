# 13. 管理者権限分離（SoD）実装計画

最終更新: 2026-04-26
ステータス: Planned
優先度: P1

## 1. 目的
管理系APIと `admin-ui` を単一の「admin権限」依存から脱却させ、職務分掌（SoD）に沿った最小権限運用を実現する。

達成したい状態:
- `System Admin` / `Support` / `Security Auditor` の3ロールで権限境界が明確
- `/v1/admin/*` でエンドポイント単位の権限検証が機能する
- `admin-ui` で許可された操作のみ表示・実行される
- 監査ログで「誰が何を試み、何が拒否されたか」を追跡できる

## 2. 現状整理（2026-04-26）
### 2.1 実装済み
- RBACテーブル（`roles`, `permissions`, `role_permissions`, `user_roles`）が存在
- `RBACService.authorizationCheck` が `resource:action` 形式で判定
- 管理系ルートは実装済み
  - `apps/idp-server/src/modules/config/config.routes.ts`
  - `apps/idp-server/src/modules/oauth-clients/oauth-client.routes.ts`
  - `apps/idp-server/src/modules/keys/keys.routes.ts`
  - `apps/idp-server/src/modules/audit/audit.routes.ts`
- `admin-ui` は設定更新UIを提供済み

### 2.2 ギャップ
1. 管理系APIの大半が `admin:manage` 一律判定
2. ロールごとの権限マトリクスが未定義
3. `admin-ui` に権限ベース表示制御がない
4. 権限不足時の監査記録（拒否イベント）が弱い

## 3. 完了定義（Definition of Done）
- [ ] SoDロール3種と権限キー一覧が固定される
- [ ] 管理系エンドポイントごとに必要権限が実装される
- [ ] 権限不足アクセスが 403 + 監査ログ記録される
- [ ] `admin-ui` で権限に応じた表示/操作制御が有効化される
- [ ] シード/移行手順でロール初期データを再現可能
- [ ] unit/contract/UIテストが追加される
- [ ] `pnpm verify` が通る

## 4. スコープ
### 4.1 対象
- `apps/idp-server/src/modules/rbac/rbac.service.ts`
- `apps/idp-server/src/modules/config/config.routes.ts`
- `apps/idp-server/src/modules/oauth-clients/oauth-client.routes.ts`
- `apps/idp-server/src/modules/keys/keys.routes.ts`
- `apps/idp-server/src/modules/audit/audit.routes.ts`
- `apps/idp-server/src/seed.ts`
- `packages/shared/src/schemas/admin.ts`
- `apps/admin-ui/src/App.tsx`
- `apps/admin-ui/src/lib/admin-api.ts`
- `apps/admin-ui/src/lib/schemas.ts`
- `docs/13-admin-rbac-sod-plan.md`
- `docs/security-runbook.md`
- `docs/security-event-catalog.md`

### 4.2 対象外
- 組織階層ごとの承認ワークフロー実装
- 外部IAM（SCIM/SAML）連携による自動プロビジョニング
- マルチテナント分離モデルの刷新

## 5. 権限モデル（固定）
### 5.1 ロール定義
1. `system_admin`
- 管理設定変更、OAuth client管理、鍵ローテーション、監査参照/出力

2. `support_operator`
- ユーザー/セッション参照、限定的サポート操作（将来拡張）
- 管理設定変更・鍵操作は不可

3. `security_auditor`
- `audit_logs` / `security_events` の参照・エクスポート
- 設定変更・鍵操作は不可

### 5.2 権限キー案
- `admin.config:read`
- `admin.config:write`
- `admin.oauth_client:read`
- `admin.oauth_client:write`
- `admin.keys:read`
- `admin.keys:rotate`
- `admin.audit:read`
- `admin.audit:export`

### 5.3 エンドポイント対応
- `GET /v1/admin/configs` -> `admin.config:read`
- `PUT /v1/admin/configs/*` -> `admin.config:write`
- `GET /v1/admin/oauth/clients` -> `admin.oauth_client:read`
- `POST|PUT /v1/admin/oauth/clients*` -> `admin.oauth_client:write`
- `GET /v1/admin/keys` -> `admin.keys:read`
- `POST /v1/admin/keys/rotate*` -> `admin.keys:rotate`
- `GET /v1/admin/audit/*` -> `admin.audit:read`
- `POST /v1/admin/audit/exports` -> `admin.audit:export`

## 6. 実装タスク（着手順）
### Task 1: 権限マトリクスと初期データ整備（Day 1-2）
担当: Backend

対象:
- `apps/idp-server/src/seed.ts`
- 必要に応じて `infra/migrations/*`

内容:
- 3ロール + 権限キーをseedへ追加
- 既存 `admin` ロールから段階移行できる互換運用を定義
- 開発/検証環境向けの初期ユーザー割当を更新

受け入れ条件:
- seed後に各ロールで期待権限が再現できる

### Task 2: API認可ガードの細分化（Day 2-4）
担当: Backend

対象:
- `apps/idp-server/src/modules/config/config.routes.ts`
- `apps/idp-server/src/modules/oauth-clients/oauth-client.routes.ts`
- `apps/idp-server/src/modules/keys/keys.routes.ts`
- `apps/idp-server/src/modules/audit/audit.routes.ts`

内容:
- `assertAdmin` を `assertPermission(resource, action)` 方式へ置換
- ルート単位の必要権限を明示
- 拒否時のエラーメッセージを統一

受け入れ条件:
- ロール別に許可/拒否がエンドポイント単位で一致する

### Task 3: 監査証跡の強化（Day 3-5）
担当: Backend + Security

対象:
- 監査記録処理（`auditRepository` 利用箇所）
- `docs/security-event-catalog.md`

内容:
- 権限拒否時の監査イベント追加（例: `admin.access.denied`）
- payloadへ `resource`, `action`, `actorUserId` を格納
- 不正な権限昇格試行をHigh/Mediumで分類

受け入れ条件:
- 403発生時に追跡可能な監査記録が必ず残る

### Task 4: admin-ui 権限制御（Day 4-6）
担当: Frontend

対象:
- `apps/admin-ui/src/lib/admin-api.ts`
- `apps/admin-ui/src/lib/schemas.ts`
- `apps/admin-ui/src/App.tsx`

内容:
- ログイン中ユーザーの権限取得API（またはclaims）を参照
- 権限に応じてセクション表示・編集可否・送信可否を制御
- 禁止操作はUI上も非活性化し、API 403時も明示表示

受け入れ条件:
- `support_operator` と `security_auditor` で設定更新ボタンが利用不可

### Task 5: テスト拡充と段階リリース（Day 7-10）
担当: Backend + Frontend + QA

対象:
- `apps/idp-server/src/contracts/protected.openapi-contract.test.ts`
- 管理系ルートの `*.test.ts`
- `apps/admin-ui/src/lib/api-client.test.ts`

内容:
- ロール別テスト（許可/拒否）を追加
- 既存admin互換モードでの回帰を確認
- 本番段階適用:
  - Phase A: audit read系のみ新権限化
  - Phase B: config/oauth管理系を新権限化
  - Phase C: key操作を新権限化

受け入れ条件:
- 既存運用を止めずに新権限へ移行できる

## 7. 実行スケジュール（固定日付）
1. 2026-04-27: Task 1 着手（ロール/権限定義）
2. 2026-04-28: Task 2 着手（APIガード分割）
3. 2026-04-29: Task 2 完了、Task 3 着手（監査強化）
4. 2026-04-30: Task 4 着手（admin-ui制御）
5. 2026-05-01: Task 3/4 完了、結合確認
6. 2026-05-04: Task 5 開始（ロール別回帰）
7. 2026-05-08: 本番段階適用完了

## 8. テストマトリクス
1. API認可
- `system_admin` は全管理APIを実行可能
- `security_auditor` は audit read/export のみ許可
- `support_operator` は設定変更・鍵操作が拒否される

2. 監査
- 403時に `admin.access.denied` が記録される
- 監査ログに actor/resource/action が含まれる

3. UI
- 権限不足ロールで編集UIが非表示または無効
- API 403時に操作結果が失われずエラー表示される

4. 回帰
- 既存 `admin` ロールユーザーの運用を壊さない
- OpenAPI契約テストが維持される

## 9. ロールアウト方針
- Feature flag `ADMIN_SOD_ENFORCED` を導入
- 初期は `warn-only` で拒否判定をログ観測
- 問題なければ強制モードへ移行

## 10. ロールバック戦略
- 重大障害時は `ADMIN_SOD_ENFORCED=false` で旧 `admin:manage` 判定へ戻す
- 誤拒否発生時は該当権限のみ一時的に `admin:all` へマップ
- 変更履歴は `docs/security-runbook.md` に追記

## 11. 検証コマンド
```bash
pnpm --filter @idp/idp-server test
pnpm --filter @idp/idp-server test -- admin
pnpm --filter @idp/admin-ui test
pnpm verify
```

## 12. 実行チェックリスト
- [ ] SoDロール/権限キーの確定
- [ ] 管理APIの権限ガード分割
- [ ] 権限拒否の監査イベント追加
- [ ] admin-ui 表示/操作制御の実装
- [ ] ロール別テスト追加
- [ ] 段階ロールアウト完了
- [ ] `pnpm verify` 通過
