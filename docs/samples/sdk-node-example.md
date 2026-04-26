# SDK Sample: Node/BFF Integration

最終更新: 2026-04-26
対象SDK: `@idp/oidc-client-sdk`

## 1. 目的
Node BFFでAuthorization Code + PKCEを安全に実装する最小例を示す。

## 2. 前提
- IdP: `http://localhost:3001`
- BFF: `http://localhost:5173`
- client登録済み（`redirect_uri = http://localhost:5173/callback`）

## 3. セットアップ
```bash
pnpm install
pnpm stack:up
pnpm db:migrate
pnpm db:seed
pnpm dev
OIDC_ISSUER=http://localhost:3001 \
OIDC_CLIENT_ID=example-bff \
OIDC_CLIENT_SECRET=example-bff-secret \
BFF_BASE_URL=http://localhost:5173 \
BFF_SESSION_SECRET=dev-example-bff-session-secret-change-me \
pnpm --filter @idp/example-bff dev
```

## 4. 最小コード
```ts
import { createOidcClientSdk } from "@idp/oidc-client-sdk";

const sdk = createOidcClientSdk({
  issuer: process.env.OIDC_ISSUER!,
  clientId: process.env.OIDC_CLIENT_ID!,
  clientSecret: process.env.OIDC_CLIENT_SECRET!,
});

const { url, state, nonce, codeVerifier } = await sdk.beginLogin({
  redirectUri: "http://localhost:5173/callback",
  scope: ["openid", "profile", "email"],
});
```

callback例:
```ts
const result = await sdk.completeCallback({
  code,
  state,
  expectedState: session.state,
  expectedNonce: session.nonce,
  redirectUri: "http://localhost:5173/callback",
  codeVerifier: session.codeVerifier,
  fetchUserInfo: true,
});

// result.sessionIdentity を local session cookie 用に保存
```

logout例:
```ts
const logout = await sdk.logout({
  mode: "global",
  refreshToken: session.refreshToken,
  idTokenHint: session.idToken,
  postLogoutRedirectUri: "http://localhost:5173/",
  clearLocalSession: async () => {
    clearBffSessionCookie();
    clearPendingOidcStateCookie();
  },
});

if (logout.logoutUrl) {
  redirect(logout.logoutUrl);
}
```

## 5. 動作確認
```bash
pnpm verify:example-bff-e2e
```

期待結果:
- `/login` -> IdP login -> `/callback` -> `/me` が200
- `/logout` 後もIdPセッションがあれば再SSOできる

## 6. よくある失敗
1. `oidc_invalid_callback`
- 原因: state不一致
- 対処: `state/nonce/codeVerifier` の保存と読み出しを同一セッションで行う

2. `oidc_rate_limited`
- 原因: `/oauth/token` 過負荷
- 対処: リトライ間隔を指数バックオフにする

3. `oidc_invalid_response`
- 原因: client設定ミスまたはtokenレスポンス不整合
- 対処: client secret / redirect URI / grant type を確認する

4. ログアウト後に再ログイン済みに見える
- 原因: local logoutだけを実行し、IdP global sessionが残っている
- 対処: 全アプリから明示的に退出させたい場合は `logout({ mode: "global" })` を使う
