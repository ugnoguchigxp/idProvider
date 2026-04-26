# mobile-kotlin-sdk (Minimal)

最終更新: 2026-04-26

Android/Kotlin向けのOIDCクライアントSDK最小雛形です。

## Scope (MVP)
- Authorization Code + PKCE
- Token exchange
- Refresh token
- Logout URL generation

## Build/Test
```bash
cd packages/mobile-kotlin-sdk
./gradlew test
```

注記: 本ディレクトリはpnpm workspaceのビルド対象ではありません。
