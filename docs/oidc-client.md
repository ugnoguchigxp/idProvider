# OIDC Client SDK Contract

最終更新: 2026-04-26
対象: `@idp/server-sdk`（現行） / `@idp/oidc-client-sdk`（拡張予定）

## 1. 目的
本ドキュメントは、Single-tenant OSS IdPを利用するクライアントSDKの公開契約を固定する。

この契約で固定する内容:
- 認証フロー（Authorization Code + PKCE）
- トークン更新・失効・ログアウト
- SDKエラーの正規化方針
- バージョニング互換ルール

## 2. サポート対象
### 2.1 現在の実装
- Node/BFF向け: `@idp/server-sdk`

### 2.2 拡張予定
- Browser/Mobile向け: `@idp/oidc-client-sdk`
- Kotlin / Swift向けSDK（別パッケージ）

注記:
- 本ドキュメントの「共通契約」は、言語SDK間で共通に保つべき仕様を定義する。
- 実際のAPI名はSDKごとに差異を許容するが、責務は一致させる。

## 3. フロー契約
### 3.1 Authorization Code + PKCE
1. 認可URLを生成し、`state`, `nonce`, `codeVerifier` を得る
2. ユーザーを認可エンドポイントへリダイレクト
3. callbackで `code` と `state` を受け取る
4. `state` を照合し、`code` をトークンへ交換
5. `id_token` を検証
6. 必要に応じて `userinfo` を取得
7. アプリケーション側セッションへ変換

### 3.2 Refresh
- `refresh_token` で `access_token`（必要に応じて `id_token`, `refresh_token`）を再取得する
- 失敗時はエラーコードに応じて再試行可否を判定する

### 3.3 Revocation
- `access_token` または `refresh_token` を失効できる
- 失効後の再利用は成功させない

### 3.4 Logout
- local logout（アプリローカルのセッション破棄）と
- global logout（IdPセッション終了URLへの遷移）を分ける

## 4. Node SDK（現行実装）公開API契約
対象: `packages/server-sdk/src/index.ts`

### 4.1 必須API
- `createAuthorizationUrl()`
- `exchangeCode()`
- `completeAuthorizationCodeCallback()`
- `verifyIdToken()`
- `getUserInfo()`
- `refreshTokens()`
- `introspectToken()`
- `revokeToken()`
- `createLogoutUrl()`
- `toSessionIdentity()`

### 4.2 入出力の正規契約
- Authorization URL生成: `url`, `state`, `nonce`, `codeVerifier`
- Token exchange: `idToken`, `accessToken`, `refreshToken?`, `expiresIn`
- Refresh: `accessToken`, `idToken?`, `refreshToken?`, `expiresIn`
- Introspection: `active` と標準クレーム（`sub`, `exp`, `iat` 等）

## 5. 共通エラー契約
### 5.1 SDK内部エラー（Node実装）
`ServerSdkError.code`:
- `oidc_invalid_callback`
- `oidc_invalid_response`
- `oidc_invalid_token`
- `oidc_timeout`
- `oidc_http_error`
- `oidc_rate_limited`
- `oidc_unsupported`

### 5.2 再試行ポリシー
- retryable = `true`
  - `oidc_timeout`
  - `oidc_rate_limited`
  - `oidc_http_error`（5xx相当）
- retryable = `false`
  - `oidc_invalid_callback`
  - `oidc_invalid_response`
  - `oidc_invalid_token`
  - `oidc_unsupported`

### 5.3 APIエラー（IdP応答）
`ErrorResponse.code`（代表）:
- `invalid_client`
- `invalid_token`
- `mfa_required`
- `rate_limited`
- `unauthorized`

## 6. セキュリティ要件
- `state`, `nonce`, `codeVerifier` はアプリケーション側で一時保管し、callbackで照合する
- client secretはサーバー側のみで保持する
- access/refresh tokenをアプリケーションログに出力しない
- local session cookieは `httpOnly` / `secure` / `sameSite` を適用する

## 7. 互換性ポリシー
- `MAJOR`: 破壊的変更（関数削除、戻り値の互換破壊）
- `MINOR`: 後方互換ありの機能追加
- `PATCH`: バグ修正のみ

互換性ルール:
- 公開API削除は1リリース前にdeprecateを明示する
- 互換性に影響する変更時は、次を同一PRで更新する
  1. `docs/oidc-client.md`
  2. `docs/oidc-compatibility.md`
  3. `docs/openapi.yaml`
  4. SDKのテスト

## 8. 検証コマンド
```bash
pnpm --filter @idp/server-sdk test
pnpm --filter @idp/server-sdk typecheck
pnpm verify:openapi
pnpm --filter @idp/idp-server test:contract
```

## 9. 実装責務の分界
SDKが担当:
- OIDC/OAuth通信、署名検証、エラー正規化

アプリケーションが担当:
- state/nonce/codeVerifier永続化
- local session発行
- downstreamサービス認証コンテキスト設計
