# SDK Sample: Swift Mobile Integration

最終更新: 2026-04-26
対象SDK: `packages/mobile-swift-sdk`（最小実装）

## 1. 目的
iOS/SwiftアプリでAuthorization Code + PKCEを実装する最小手順を示す。

## 2. 最小フロー
1. `beginLogin()` で `authorizationURL/state/nonce/codeVerifier` を生成
2. ASWebAuthenticationSessionで認可画面を表示
3. callback URLから `code/state` を取得
4. `exchangeCode()` でtoken取得
5. `refreshToken()` で更新
6. 必要に応じ `createLogoutURL()` でglobal logout

## 3. サンプルコード
```swift
let client = MobileSwiftSdk(
  issuer: "https://idp.example.com",
  clientId: "ios-client",
  redirectUri: "com.example.app:/oauth/callback"
)

let login = try await client.beginLogin()
// login.authorizationURL を開く

let tokens = try await client.exchangeCode(
  code: "authorization-code",
  codeVerifier: login.codeVerifier
)

let logout = try client.logout(LogoutInput(
  mode: .global,
  idTokenHint: tokens.idToken,
  postLogoutRedirectUri: "com.example.app:/signed-out",
  clearLocalTokens: {
    // Keychain からtokenを削除
  }
))
// logout.logoutURL を ASWebAuthenticationSession 等で開く
```

## 4. エラー処理
- `OidcRateLimitedError`: バックオフして再試行
- `OidcNetworkError`: 再試行
- `OidcInvalidTokenError`: 再認証

## 5. 失敗ケースと復旧戦略
1. callback `state` 不一致
- 現在の認証試行を無効化し、`beginLogin()` から再開始する
2. `invalid_grant` / `token_expired`
- Keychainからrefresh tokenを削除し、ログイン画面へ遷移する
3. `mfa_required`
- step-up MFA導線へ遷移する
- 成功後に `exchangeCode()` でセッション再確立する
4. 通信タイムアウト / 一時的5xx / rate-limit
- 250ms, 500ms, 1000msで最大3回再試行する
- 失敗時はUIで再試行を促し、強制終了させない
5. `invalid_client` / `OidcInvalidTokenError`
- 設定不整合として扱い、ユーザーには一般メッセージ表示
- 開発ログへエラーコードと相関IDのみ記録する

## 6. 注意点
- `codeVerifier` / `refreshToken` はKeychainで保護
- バックグラウンド復帰時にtoken有効期限を確認する
- ログにtoken本体・PIIを出力しない
