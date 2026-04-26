# mobile-kotlin-sdk (Minimal)

最終更新: 2026-04-26

Android/Kotlin向けのOIDCクライアントSDK最小雛形です。

## Scope (MVP)
- Authorization Code + PKCE
- Token exchange
- Refresh token
- Logout URL generation

## Error Handling Contract
- retryable: `OidcRateLimitedError`, `OidcNetworkError`, `oidc_timeout`, 一時的 `oidc_http_error`
- non-retryable: `OidcInvalidTokenError`, `invalid_client`, `invalid_grant`, `token_expired`
- `mfa_required`: step-up MFA完了後に `exchangeCode` を再実行

## Recovery Policy (Mobile)
1. refresh失敗が `invalid_grant` / `token_expired` の場合はrefresh tokenを破棄し再ログインへ遷移
2. retryableエラーは指数バックオフで最大3回再試行
3. `state` 不一致はセッション破棄してログインをやり直す
4. エラーログはコードとtrace idのみ記録し、トークン値は出力しない

## Logout Contract
- `logout(LogoutInput(mode = LOCAL))`: 端末内token削除hookを実行し、IdP sessionは維持
- `logout(LogoutInput(mode = GLOBAL))`: 端末内token削除hookを実行し、IdP logout URLを返す
- network revokeを追加する場合も、revoke失敗時に端末内tokenを残さない
- token本体をログ・永続queueへ保存しない

## Build/Test
```bash
cd packages/mobile-kotlin-sdk
./gradlew test
```

注記: 本ディレクトリはpnpm workspaceのビルド対象ではありません。
