# mobile-swift-sdk (Minimal)

最終更新: 2026-04-26

iOS/Swift向けのOIDCクライアントSDK最小雛形です。

## Scope (MVP)
- Authorization Code + PKCE (URL generation)
- Token exchange (placeholder)
- Refresh (next phase)
- Logout URL generation (next phase)

## Build/Test
```bash
cd packages/mobile-swift-sdk
swift test
```

注記: 本ディレクトリはpnpm workspaceのビルド対象ではありません。
