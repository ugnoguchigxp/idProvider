# 20. モバイル実運用機能 実装計画

最終更新: 2026-04-26
ステータス: Planned（Design-Ready）
優先度: P1

## 1. 目的
iOS / Android クライアントが本番運用で要求されるセキュリティ・UX・障害耐性を満たす認証基盤を提供する。

達成したい状態:
- PKCE + refresh rotation + step-up MFA の標準フローが確立
- deep link / universal link を含む実装手順がある
- 端末切替・オフライン復帰時のセッション整合が保証される

## 2. 現状整理（2026-04-26）
### 2.1 実装済み
- Authorization Code + PKCE（サーバー側対応）
- MFA（TOTP / WebAuthn）およびセッション管理API

### 2.2 ギャップ
1. モバイルSDKレベルの再認証フローが未標準化
2. deep link / universal link の検証シナリオが不足
3. 端末紛失・端末変更時の運用手順が不足

## 3. スコープ
### 3.1 対象
- `docs/oidc-client.md`
- `docs/sso-idp-gap-plan.md`
- `apps/idp-server/src/modules/auth/*`
- `apps/idp-server/src/modules/sessions/*`
- `apps/idp-server/src/modules/mfa/*`
- `docs/runbooks/mobile-auth-incident.md`（新規）
- `docs/samples/mobile/*`（新規）

### 3.2 対象外
- Push通知SDKの実装
- 端末管理（MDM）機能そのもの

## 4. 実装フェーズ
### Phase 1: モバイル認証仕様固定
- 認証開始・refresh失敗・step-up要求時の挙動を定義
- エラーコードマッピングを固定

### Phase 2: 端末ライフサイクル対応
- device binding方針を導入
- 端末紛失時の全セッション失効runbookを定義

### Phase 3: E2E検証
- iOS/Android両方でPKCE + refresh + logoutを自動検証
- network不安定時の再試行テスト追加

## 5. タスク
### Task 1: 仕様定義（Day 0-2）
担当: Mobile Lead + Backend

### Task 2: サーバー側補強（Day 2-5）
担当: Backend

### Task 3: モバイルE2E整備（Day 5-9）
担当: Mobile + QA

## 6. 完了定義（Definition of Done）
- [ ] iOS/Androidで統一フローが再現可能
- [ ] refresh失敗時の再認証遷移が仕様通り
- [ ] step-up MFAを含むE2Eが通る
- [ ] モバイル事故対応runbookが整備される

## 7. 検証コマンド（予定）
```bash
pnpm verify:sso-e2e
pnpm verify
```

## 8. スケジュール（固定日付）
1. 2026-04-28: Task 1
2. 2026-04-30: Task 2
3. 2026-05-03: Task 3
