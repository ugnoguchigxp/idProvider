# Example BFF

Hono based relying-party example for `@idp/server-sdk`.

The example keeps the IdP login on the IdP domain, receives the Authorization Code callback, verifies tokens through the server SDK, and then issues its own httpOnly local session cookie.

## Run

```sh
OIDC_ISSUER=http://localhost:3001 \
OIDC_CLIENT_ID=local-client \
OIDC_CLIENT_SECRET=local-client-secret \
BFF_BASE_URL=http://localhost:5173 \
BFF_SESSION_SECRET=dev-example-bff-session-secret-change-me \
pnpm --filter @idp/example-bff dev
```

Routes:

- `GET /login`
- `GET /callback`
- `GET /me`
- `GET /protected`
- `POST /logout`
- `POST /logout/global`

The local session cookie contains only a signed identity snapshot. OIDC access token, refresh token, ID Token, and client secret are not stored in the browser cookie.

Logout behavior:

- `POST /logout` clears the BFF local session cookie and pending OIDC state cookie.
- `POST /logout/global` clears local cookies first, then redirects to the IdP logout URL.
- Local logout does not clear the IdP global session. Use global logout when a shared or lost device must be fully signed out.
