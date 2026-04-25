# gxp-idProvider

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24_LTS-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10+-orange.svg)](https://pnpm.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**gxp-idProvider** は、高パフォーマンス、セキュリティ、および拡張性を重視して設計されたコンシューマーグレードのアイデンティティプロバイダー (IdP) 実装です。モダンな TypeScript スタックを活用し、OIDC/OAuth2 互換の認証サービスを提供します。

---

## 🚀 主な機能

- **標準的な認証フロー**: サインアップ、ログイン、ログアウトおよびセッション管理。
- **高度なセキュリティ**:
  - Argon2id によるパスワードハッシュ化。
  - セッションハイジャックを防止するリフレッシュトークン回転 (RTR)。
  - TOTP による多要素認証 (MFA)。
- **標準プロトコル対応**:
  - `oidc-provider` による OIDC/OAuth2 ディスカバリおよびエンドポイント。
  - イントロスペクションおよびリボケーションエンドポイント。
- **コンプライアンスと監査**:
  - 詳細なセキュリティイベントログ。
  - すべての管理者およびユーザーアクションに対する永続的な監査ログ。
- **開発者フレンドリー**:
  - Zod スキーマバリデーションによる完全な TypeScript サポート。
  - Drizzle ORM による型安全なデータベース操作。
  - 関心の分離を徹底したモノレポ構造。

---

## 🛠 技術スタック

- **ランタイム**: Node.js 24 LTS
- **Web フレームワーク**: [Hono](https://hono.dev/)
- **データベース**: PostgreSQL (via [Drizzle ORM](https://orm.drizzle.team/))
- **OIDC エンジン**: [oidc-provider](https://github.com/panva/node-oidc-provider)
- **バリデーション**: [Zod](https://zod.dev/)
- **テスト**: [Vitest](https://vitest.dev/) (カバレッジ 80% 以上を強制)

---

## 📂 プロジェクト構造

```text
.
├── apps/
│   └── idp-server/           # メイン API サーバー & OIDC ランタイム
├── packages/
│   ├── auth-core/           # ドメインロジック (AuthService)
│   ├── db/                  # データベーススキーマ & Drizzle クライアント
│   ├── shared/              # 共有 Zod スキーマ & エラーモデル
│   ├── oidc-client-sdk/     # クライアントアプリ向け SDK
│   └── server-sdk/          # バックエンドサービス統合向け SDK
├── infra/
│   ├── docker-compose.yml    # ローカル開発用スタック (Postgres/Redis)
│   └── migrations/          # SQL マイグレーションファイル
└── docs/
    ├── openapi.yaml         # API 仕様書 (ドラフト)
    └── data-retention-policy.md # 保持期間・匿名化・自動削除ポリシー
```

---

## ⚙️ セットアップ

### 前提条件

- Node.js >= 24.0.0
- pnpm >= 10
- Docker Desktop

### インストール

1. **リポジトリをクローンする**
2. **依存関係をインストールする**
   ```bash
   pnpm install
   ```
3. **環境変数を設定する**
   ```bash
   cp .env.example .env
   ```
4. **ローカルインフラを起動する**
   ```bash
   pnpm stack:up
   ```
5. **マイグレーションを実行する**
   ```bash
   pnpm db:migrate
   ```
6. **開発サーバーを起動する**
   ```bash
   pnpm dev
   ```

---

## 🧪 テスト

プロジェクトでは、厳格なコードカバレッジ閾値（ライン、ブランチ、関数すべて 80% 以上）を設定しています。

```bash
# 全テストを実行
pnpm test

# カバレッジレポート付きでテストを実行
pnpm test --coverage

# プロジェクト全体の型チェック
pnpm typecheck

# 型 + テスト + ビルド + OpenAPI 検証
pnpm verify

# Linter (Biome) のみ実行
pnpm verify:lint

# 依存脆弱性チェック（任意）
pnpm verify:security

# 保持期間バッチ（dry-run）
pnpm retention:dry-run

# 保持期間バッチ（実行）
pnpm retention:run
```

---

## 🛣 ロードマップと改善案（コードレビューに基づく）

詳細計画: [実装計画書](docs/implementation-plan.md)

- [x] **トランザクションの整合性**: サインアップやパスワードリセット等の複数ステップフローを DB トランザクションで保護。
- [x] **JWKS サポート**: 公開鍵の配信および自動回転の実装。
- [x] **設定の外部化**: セッションの有効期限やハッシュパラメータを環境変数に移行。
- [x] **OIDC 統合の強化**: Hono ルートと `oidc-provider` のディスカバリロジックの連携強化。

---

## 📄 ライセンス

MIT License - 詳細は [LICENSE](LICENSE) を参照してください。
