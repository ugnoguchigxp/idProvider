# Google Federation (外部 IdP 連携) 詳細設計

最終更新: 2026-04-25
対象: Google ログインおよびアカウント紐付けフロー

---

## 1. 目的
Google ログインを利用した新規登録、および既存の自社 ID アカウントと Google アカウントの安全な紐付けを実現する。

## 2. セキュリティ要件
- **email_verified の強制**: Google から返される ID Token の `email_verified` が `true` であることを必須とする。
- **再認証の強制**: 既存アカウントへの Google 紐付け (`/v1/identities/google/link`) 前には、必ずパスワードまたは MFA による再認証（Sudo Mode）を要求する。
- **二重紐付け防止**: 1 つの Google Subject は 1 つの自社 ID にしか紐付けられない。

## 3. シーケンス: アカウント紐付け (Link)
1. **ログイン状態確認**: ユーザーが既に自社 ID でログインしている。
2. **紐付けリクエスト**: `POST /v1/identities/google/link` を呼び出し。
3. **再認証 (Step-up)**: セッションが「高リスク」とみなされ、パスワード入力を要求。
4. **Google 認証**: Google の OIDC フローを実行。
5. **整合性チェック**: 取得した Google メールアドレスと自社 ID の整合性、および他ユーザーへの紐付け有無を確認。
6. **DB 更新**: `external_identities` テーブルにレコードを挿入。

## 4. 実装タスク
1. **Google クライアント実装**: `AuthService` に Google OIDC と通信するロジックを追加。
2. **紐付けロジック**: 再認証チェックを含むリンク/アンリンク API の実装。
3. **検証**: Google Sandbox 環境を用いたフェデレーションテスト。
