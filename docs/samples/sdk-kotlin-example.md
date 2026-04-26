# SDK Sample: Kotlin Mobile Integration

最終更新: 2026-04-26
対象SDK: `packages/mobile-kotlin-sdk`（最小実装）

## 1. 目的
Android/KotlinアプリでPKCEフローを実装する最小手順を示す。

## 2. 依存
`packages/mobile-kotlin-sdk` の実装を参照。

## 3. 最小フロー
1. `beginLogin()` で `authorizationUrl/state/nonce/codeVerifier` を取得
2. Custom Tabで認可画面へ遷移
3. redirect URI受信後、`completeCallback()` 相当でcode交換
4. `refreshToken()` でアクセストークン更新
5. `createLogoutUrl()` でglobal logout

## 4. サンプルコード
```kotlin
val client = MobileKotlinSdk(
  issuer = "https://idp.example.com",
  clientId = "mobile-client",
  redirectUri = "com.example.app:/oauth/callback"
)

val login = client.beginLogin()
// login.authorizationUrl を開く

val token = client.exchangeCode(
  code = "authorization-code",
  codeVerifier = login.codeVerifier
)
```

## 5. エラー処理
- `OidcRateLimitedError`: リトライ可
- `OidcNetworkError`: リトライ可
- `OidcInvalidTokenError`: 再ログイン要求

## 6. 失敗ケースと復旧戦略
1. callback `state` 不一致
- セッション破棄し、`beginLogin()` から認証フローを再開する
2. `invalid_grant` / `token_expired`（refresh失敗）
- 保存済みrefresh tokenを破棄する
- ログイン画面へ遷移し、`beginLogin()` からやり直す
3. `mfa_required`
- step-up MFA画面へ遷移する
- 成功後に `exchangeCode()` を再実行してセッション再確立する
4. ネットワーク断 / 一時的5xx / rate-limit
- 250ms, 500ms, 1000msの指数バックオフで最大3回再試行する
- 3回失敗したらユーザー操作で再試行させる
5. `invalid_client` / `OidcInvalidTokenError`
- ユーザー向けには一般化メッセージを表示する
- 開発者向けにエラーコードとrequest idを記録する

## 7. 注意点
- `codeVerifier` と `nonce` は端末内安全ストレージに短時間保持する
- リフレッシュトークンは平文ログ出力しない
- ログにはPII/トークンを出さず、`traceId` とエラーコードのみ残す
