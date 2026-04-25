# Audit Log完全性・保全計画

## 目的
認証・認可・管理操作の監査ログを、調査・内部統制・インシデント対応に使える証跡として強化する。

## 背景
自前IdPの強みは、自社要件に合わせた詳細な証跡を保持できること。単なるログ出力では、改ざん検知、検索、保全、エクスポートに弱い。

## 対象イベント
- Signup/login/logout
- Login failure
- MFA enroll/verify/recovery
- WebAuthn register/authenticate
- Password change/reset
- Email verification
- Google link/unlink/login
- Session revoke/revoke-all
- RBAC/admin config change
- Client registry change
- Key rotation
- Account deletion

## 実装方針
- 重要イベントはaudit log必須にする。
- Security eventとaudit logの責務を分ける。
- hash chainまたは署名により改ざん検知を可能にする。
- retention/export/search APIを用意する。
- PIIを分類し、必要最小限を保存する。

## フェーズ
1. Audit event catalogを作る。
2. 既存実装のイベント網羅性をレビューする。
3. 不足イベントを追加する。
4. hash chain/署名方式を設計する。
5. export/search APIを追加する。
6. retention policyと削除処理を追加する。

## 受け入れ条件
- 重要操作がaudit logに残る。
- 監査ログの欠落をテストで検出できる。
- 改ざん検知方式がある。
- 期間指定・actor指定・resource指定で検索できる。
- export可能である。

## 優先度
高。企業導入とインシデント対応に強く刺さる。
