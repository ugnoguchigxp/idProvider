# 管理 UI 実装計画

最終更新: 2026-04-25
対象: 管理機能の拡張

---

## 1. 目的
管理者がソースコードの変更やデプロイを伴わずに、システムの振る舞い（ソーシャルログイン、通知、メール雛形）を動的に制御できるようにする。

## 2. 実装機能

### 2-1. ソーシャルログイン制御
- **機能**: Google ログイン等の外部 IdP 連携の有効/無効を切り替えるトグル。
- **管理項目**:
  - `provider_enabled`: Boolean
  - `client_id` / `client_secret`: (参照・更新)
- **影響範囲**: `AuthService` のログインフローおよび UI 上のログインボタン表示。

### 2-2. 障害・セキュリティ通知設定
- **機能**: システム異常や不正アクセス検知時の通知先設定。
- **管理項目**:
  - `notification_recipients`: 通知先メールアドレスのリスト
  - `alert_levels`: 通知対象とするイベントレベル (Critical / Warning)
- **影響範囲**: `SecurityEvent` 発行時の非同期メール送信トリガー。

### 2-3. メール雛形（テンプレート）管理
- **機能**: サインアップ検証、パスワードリセット等のメール内容の編集。
- **管理項目**:
  - `template_key`: (signup_verify, password_reset, etc.)
  - `subject`: 件名
  - `body`: 本文 (HTML/Text, 変数埋め込み対応)
- **影響範囲**: `AuthService` 内のメール送信処理。

## 3. 技術スタック
- **Frontend**: Hono + Hono JSX + HTMX (高速な開発と SSR によるセキュリティを両立)
- **Backend**: `idp-server` 内に `/admin` ルーティングを新設
- **認証**: 管理者ロール (`admin` パーミッション) を持つユーザーのみに制限

## 4. DB 拡張 (`packages/db`)
`system_configs` テーブルを新設し、JSONB 型で設定値を保持する。

```typescript
export const systemConfigs = pgTable("system_configs", {
  key: varchar("key", { length: 128 }).primaryKey(), // 'social_login', 'notifications', 'email_templates'
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

## 5. ステップ別タスク
1. **DB マイグレーション**: `system_configs` テーブルの作成と初期データの投入。
2. **Config サービス**: `packages/auth-core` に設定の取得・更新を行う `ConfigService` を追加。
3. **Admin API**: 管理者専用のエンドポイントを実装。
4. **Admin UI**: 設定変更用画面の作成。
