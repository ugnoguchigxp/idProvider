# Client Registry計画

## 目的
OAuth/OIDC clientをenv固定からDB管理へ移行し、複数アプリ・複数環境・secret rotationに対応できる本番向けclient管理基盤を作る。

## 背景
`OAUTH_CLIENT_ID`/`OAUTH_CLIENT_SECRET`だけでは、複数client、redirect URI allowlist、client停止、secret rotation、監査に対応しづらい。自前IdPの価値はclientごとの制御を持てる点にある。

## 対象機能
- Client作成/更新/停止
- Client ID/secret発行
- Secret hash保存
- Secret rotation
- Redirect URI allowlist
- Allowed grant types
- Allowed scopes
- Token lifetime override
- Public/confidential client区分
- Client audit log

## DB設計案
- `oauth_clients`
- `oauth_client_secrets`
- `oauth_client_redirect_uris`
- `oauth_client_scopes`
- `oauth_client_audit_logs`

## 実装方針
- secretは平文保存しない。
- client lookupは低レイテンシにする。
- redirect URIは完全一致を基本とする。
- client無効化時はtoken refresh/revocation/introspectionの扱いを定義する。
- admin操作はaudit log必須にする。

## フェーズ
1. DB schema/migrationを追加する。
2. Repository/Serviceを追加する。
3. OAuth client authをDB lookupへ切り替える。
4. admin APIを追加する。
5. secret rotationとaudit logを追加する。
6. env固定clientをdevelopment seedへ移す。

## 受け入れ条件
- 複数clientを登録できる。
- client secretはhash保存される。
- redirect URI allowlistが強制される。
- secret rotation中に旧secretの猶予期間を設定できる。
- client操作がaudit logに残る。

## 優先度
高。自前IdPとしての運用価値を大きく底上げする。
