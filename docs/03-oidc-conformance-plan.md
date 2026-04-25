# OAuth/OIDC Conformance強化計画

## 目的
標準互換性への不安を減らし、自前IdPとして外部アプリケーションやSDKと安全に連携できる状態にする。

## 背景
IdPは独自仕様が混ざると接続先ごとに障害が出る。OIDC/OAuthの標準挙動をテストで固定することで、導入時の信頼性を上げる。

## 対象
- Discovery endpoint
- JWKS endpoint
- Authorization Code flow
- Token endpoint
- Refresh token rotation
- Revocation
- Introspection
- Client authentication
- Redirect URI validation
- Scope/claim handling
- ID token claims
- Access token lifetime
- Error response format

## 実装方針
- OpenID Foundation conformance suiteの導入可否を検証する。
- まず自動化しやすい内部conformance testsをVitestで実装する。
- 標準仕様との差異は`docs/oidc-compatibility.md`に明記する。
- 本番非対応のOIDC provider設定を明確に分離する。

## フェーズ
1. 現在のOIDC/OAuth実装範囲を棚卸しする。
2. 必須仕様と任意仕様を分類する。
3. redirect URI、client auth、token responseのconformance testを追加する。
4. Discovery/JWKS/claimsの検証を追加する。
5. OpenID conformance suite実行手順を整備する。

## 受け入れ条件
- 対応済みflowのconformance testがCIで通る。
- 未対応仕様が明示されている。
- redirect URI/client auth/token rotationの標準挙動がテストされている。
- 外部サンプルアプリでログイン/refresh/logout相当が動作する。

## 優先度
高。IdPとして名乗るうえで最も外部信頼に効く。
