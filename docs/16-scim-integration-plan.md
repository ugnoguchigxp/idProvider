# 16. SCIM Integration Plan

最終更新: 2026-04-26
ステータス: Planned（Deferred / On-Demand Implementation）
優先度: P2

## 1. 目的
企業向けの自動プロビジョニング要件に対応するため、SCIM 2.0（RFC 7643/7644）でユーザー・グループ同期を提供する。

達成したい状態:
- 主要IdP（Okta / Entra ID など）からSCIMでUser/Group同期できる
- deprovision時に本IdPのセッション・権限が一貫して失効する
- 失敗時の再同期と監査証跡が残る

## 2. 現状整理（2026-04-26）
### 2.1 実装済み
- `users`, `groups`, `group_memberships`, `user_roles` 等の基盤スキーマ
- RBAC / entitlement 判定API
- 監査ログ・セキュリティイベント基盤

### 2.2 未実装（ギャップ）
1. `/scim/v2/*` エンドポイント群が未実装
2. SCIM接続情報（token, tenant, mapping）の永続化テーブルがない
3. PATCH/filter/pagination のSCIM互換処理がない
4. 再同期・失敗再試行ジョブがない

## 3. スコープ
### 3.1 対象
- `apps/idp-server/src/modules/scim/*`（新規）
- `packages/shared/src/schemas/scim.ts`（新規）
- `packages/db/src/schema.ts`（SCIMテーブル追加）
- `infra/migrations/*`（SCIM向けmigration追加）
- `docs/openapi.yaml`（SCIM API追加）

### 3.2 対象外
- SCIM以外のHR連携（ETL一括連携）
- IdP固有拡張スキーマの初期フル対応

## 4. 必須データモデル
- `scim_connections`
- `scim_tokens`
- `scim_identities`（externalId ↔ userId）
- `scim_sync_jobs`
- `scim_sync_errors`

## 5. 必須API（最小）
- `GET /scim/v2/ServiceProviderConfig`
- `GET /scim/v2/ResourceTypes`
- `GET /scim/v2/Schemas`
- `GET/POST/PATCH/DELETE /scim/v2/Users`
- `GET/POST/PATCH/DELETE /scim/v2/Groups`

要件:
- `filter`, `startIndex`, `count` 対応
- RFC準拠のPATCH Operations
- idempotent update（再送安全）

## 6. セキュリティ要件
- SCIM専用Bearer token（ハッシュ保存）
- 接続単位のIP allowlist（任意）
- 監査イベント:
  - `scim.user.created`
  - `scim.user.updated`
  - `scim.user.deprovisioned`
  - `scim.group.updated`
  - `scim.sync.failed`

## 7. 実装フェーズ
### Phase 1: Readiness
- データモデル・migration
- ServiceProviderConfig/ResourceTypes/Schemas 実装

### Phase 2: User同期
- Users CRUD + PATCH
- `scim_identities` で重複防止

### Phase 3: Group同期
- Groups CRUD + membership同期
- group->role反映ポリシー

### Phase 4: 運用
- 再同期ジョブ
- 失敗再試行 / DLQ
- ダッシュボード・アラート

## 8. 完了定義（Definition of Done）
- [ ] SCIM Users/Groups同期がステージングで成功
- [ ] deprovision時にセッション失効が確認できる
- [ ] 失敗ケースの再試行導線がある
- [ ] `pnpm verify` とSCIM契約テストが通る
- [ ] 証跡が `docs/scim-records/` に保存される

## 9. 検証コマンド（予定）
```bash
pnpm --filter @idp/idp-server test -- scim
pnpm verify
```

## 10. リスクと方針
- リスク: 顧客IdP差異（属性マッピング/挙動差）
- 方針: Core SCIM準拠を優先し、IdP固有差分は接続設定で吸収
