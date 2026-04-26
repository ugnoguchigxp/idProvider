# mobile-swift-sdk (Minimal)

最終更新: 2026-04-26

iOS/Swift向けのOIDCクライアントSDK最小雛形です。

## Scope (MVP)
- Authorization Code + PKCE (URL generation)
- Token exchange (placeholder)
- Refresh (next phase)
- Logout URL generation (next phase)

## Error Handling Contract
- retryable: `OidcRateLimitedError`, `OidcNetworkError`, `oidc_timeout`, 一時的 `oidc_http_error`
- non-retryable: `OidcInvalidTokenError`, `invalid_client`, `invalid_grant`, `token_expired`
- `mfa_required`: step-up MFAを完了して `exchangeCode` を再実行

## Recovery Policy (Mobile)
1. refreshで `invalid_grant` / `token_expired` を受けたらKeychainのrefresh tokenを破棄して再ログインへ遷移
2. retryableエラーは指数バックオフで最大3回まで再試行
3. callback `state` 不一致時は認証試行を破棄してログインを再開始
4. ログはエラーコードと相関IDのみ保存し、トークンやPIIは記録しない

## Build/Test
```bash
cd packages/mobile-swift-sdk
swift test
```

注記: 本ディレクトリはpnpm workspaceのビルド対象ではありません。
