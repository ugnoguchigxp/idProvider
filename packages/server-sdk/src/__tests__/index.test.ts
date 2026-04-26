import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createAuthMiddleware,
  createJwtVerifier,
  createServerSdkClient,
} from "../index.js";

const discovery = {
  issuer: "https://login.example.com",
  authorization_endpoint: "https://login.example.com/auth",
  token_endpoint: "https://login.example.com/token",
  jwks_uri: "https://login.example.com/jwks",
  userinfo_endpoint: "https://login.example.com/me",
  end_session_endpoint: "https://login.example.com/session/end",
  introspection_endpoint: "https://login.example.com/introspect",
  revocation_endpoint: "https://login.example.com/revoke",
};

const createMockFetch = () =>
  vi.fn(async (url: string | URL | Request) => {
    const target = String(url);
    if (target.endsWith("/.well-known/openid-configuration")) {
      return Response.json(discovery);
    }
    if (target.endsWith("/token")) {
      return Response.json({
        id_token: "id-token",
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 300,
      });
    }
    if (target.endsWith("/me")) {
      return Response.json({ sub: "user-1", email: "user@example.com" });
    }
    if (target.endsWith("/introspect")) {
      return Response.json({
        active: true,
        client_id: "client",
        sub: "user-1",
        scope: "openid profile email",
        exp: 123,
        iat: 100,
      });
    }
    if (target.endsWith("/revoke")) {
      return new Response(null, { status: 200 });
    }
    return new Response("not found", { status: 404 });
  });

const base64Url = (input: Buffer | string) =>
  Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const createSignedIdToken = (claims: Record<string, unknown>) => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const kid = "kid-1";
  const header = base64Url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const payload = base64Url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(privateKey);
  const publicJwk = publicKey.export({ format: "jwk" });
  return {
    idToken: `${signingInput}.${base64Url(signature)}`,
    jwks: { keys: [{ ...publicJwk, kid, use: "sig", alg: "RS256" }] },
  };
};

const createVerifierFetch = (jwks: { keys: Array<Record<string, unknown>> }) =>
  vi.fn(async (url: string | URL | Request) => {
    const target = String(url);
    if (target.endsWith("/.well-known/openid-configuration")) {
      return Response.json(discovery);
    }
    if (target.endsWith("/jwks")) {
      return Response.json(jwks);
    }
    return new Response("not found", { status: 404 });
  });

describe("server-sdk", () => {
  it("creates an authorization URL with PKCE parameters", async () => {
    const fetch = createMockFetch();
    const client = createServerSdkClient({
      issuer: discovery.issuer,
      clientId: "client",
      clientSecret: "secret",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    const result = await client.createAuthorizationUrl({
      redirectUri: "https://app.example.com/callback",
      state: "state",
      nonce: "nonce",
    });

    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe(discovery.authorization_endpoint);
    expect(url.searchParams.get("client_id")).toBe("client");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(result.codeVerifier.length).toBeGreaterThan(30);
  });

  it("exchanges an authorization code using client basic auth", async () => {
    const fetch = createMockFetch();
    const client = createServerSdkClient({
      issuer: discovery.issuer,
      clientId: "client",
      clientSecret: "secret",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    const result = await client.exchangeCode({
      code: "code",
      redirectUri: "https://app.example.com/callback",
      codeVerifier: "verifier",
    });

    expect(result).toMatchObject({
      idToken: "id-token",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 300,
    });
    const tokenCall = fetch.mock.calls.find(([url]) =>
      String(url).endsWith("/token"),
    );
    expect(tokenCall?.[1]?.headers).toMatchObject({
      authorization: "Basic Y2xpZW50OnNlY3JldA==",
    });
  });

  it("rejects malformed token responses", async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/.well-known/openid-configuration")) {
        return Response.json(discovery);
      }
      if (target.endsWith("/token")) {
        return Response.json({
          access_token: "access-token",
          expires_in: 300,
        });
      }
      return new Response("not found", { status: 404 });
    });
    const client = createServerSdkClient({
      issuer: discovery.issuer,
      clientId: "client",
      clientSecret: "secret",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    await expect(
      client.exchangeCode({
        code: "code",
        redirectUri: "https://app.example.com/callback",
        codeVerifier: "verifier",
      }),
    ).rejects.toMatchObject({
      code: "oidc_invalid_response",
      name: "ServerSdkError",
    });
  });

  it("completes a callback by checking state, exchanging code, verifying ID Token, and fetching UserInfo", async () => {
    const { idToken, jwks } = createSignedIdToken({
      iss: discovery.issuer,
      aud: "client",
      sub: "user-1",
      email: "user@example.com",
      email_verified: true,
      nonce: "nonce",
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/.well-known/openid-configuration")) {
        return Response.json(discovery);
      }
      if (target.endsWith("/token")) {
        return Response.json({
          id_token: idToken,
          access_token: "access-token",
          expires_in: 300,
        });
      }
      if (target.endsWith("/jwks")) {
        return Response.json(jwks);
      }
      if (target.endsWith("/me")) {
        return Response.json({ sub: "user-1", email: "user@example.com" });
      }
      return new Response("not found", { status: 404 });
    });
    const client = createServerSdkClient({
      issuer: discovery.issuer,
      clientId: "client",
      clientSecret: "secret",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    const result = await client.completeAuthorizationCodeCallback({
      code: "code",
      state: "state",
      expectedState: "state",
      expectedNonce: "nonce",
      redirectUri: "https://app.example.com/callback",
      codeVerifier: "verifier",
      fetchUserInfo: true,
    });

    expect(result.idToken).toMatchObject({
      sub: "user-1",
      email: "user@example.com",
      emailVerified: true,
    });
    expect(result.userInfo).toMatchObject({
      sub: "user-1",
      email: "user@example.com",
    });
    expect(result.sessionIdentity).toMatchObject({
      userId: "user-1",
      email: "user@example.com",
      emailVerified: true,
      permissions: [],
      entitlements: {},
    });
  });

  it("rejects callback state mismatch before exchanging code", async () => {
    const fetch = createMockFetch();
    const client = createServerSdkClient({
      issuer: discovery.issuer,
      clientId: "client",
      clientSecret: "secret",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    await expect(
      client.completeAuthorizationCodeCallback({
        code: "code",
        state: "wrong",
        expectedState: "state",
        redirectUri: "https://app.example.com/callback",
        codeVerifier: "verifier",
      }),
    ).rejects.toMatchObject({
      code: "oidc_invalid_callback",
      name: "ServerSdkError",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refreshes tokens with a refresh token", async () => {
    const fetch = createMockFetch();
    const client = createServerSdkClient({
      issuer: discovery.issuer,
      clientId: "client",
      clientSecret: "secret",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    const result = await client.refreshTokens({
      refreshToken: "refresh-token",
      scope: ["openid", "email"],
    });

    expect(result).toMatchObject({
      accessToken: "access-token",
      idToken: "id-token",
      refreshToken: "refresh-token",
      expiresIn: 300,
    });
    const tokenCall = fetch.mock.calls.find(([url]) =>
      String(url).endsWith("/token"),
    );
    expect(String(tokenCall?.[1]?.body)).toContain("grant_type=refresh_token");
  });

  it("introspects and revokes tokens", async () => {
    const fetch = createMockFetch();
    const client = createServerSdkClient({
      issuer: discovery.issuer,
      clientId: "client",
      clientSecret: "secret",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    const introspection = await client.introspectToken({
      token: "access-token",
      tokenTypeHint: "access_token",
    });
    await client.revokeToken({
      token: "refresh-token",
      tokenTypeHint: "refresh_token",
    });

    expect(introspection).toMatchObject({
      active: true,
      clientId: "client",
      sub: "user-1",
      scope: "openid profile email",
      exp: 123,
      iat: 100,
    });
    expect(
      fetch.mock.calls.some(([url]) => String(url).endsWith("/revoke")),
    ).toBe(true);
  });

  it("logs out globally after revoking tokens and clearing local session", async () => {
    const fetch = createMockFetch();
    const clearLocalSession = vi.fn();
    const client = createServerSdkClient({
      issuer: discovery.issuer,
      clientId: "client",
      clientSecret: "secret",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    const result = await client.logout({
      mode: "global",
      refreshToken: "refresh-token",
      accessToken: "access-token",
      idTokenHint: "id-token",
      postLogoutRedirectUri: "https://app.example.com/",
      state: "logout-state",
      clearLocalSession,
    });

    expect(result).toEqual({
      localSessionCleared: true,
      refreshTokenRevoked: true,
      accessTokenRevoked: true,
      logoutUrl:
        "https://login.example.com/session/end?post_logout_redirect_uri=https%3A%2F%2Fapp.example.com%2F&id_token_hint=id-token&state=logout-state",
      warnings: [],
    });
    expect(clearLocalSession).toHaveBeenCalledOnce();
    const revokeCalls = fetch.mock.calls.filter(([url]) =>
      String(url).endsWith("/revoke"),
    );
    expect(revokeCalls).toHaveLength(2);
  });

  it("clears local session even when token revocation fails", async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/.well-known/openid-configuration")) {
        return Response.json(discovery);
      }
      if (target.endsWith("/revoke")) {
        return new Response("server error", { status: 503 });
      }
      return new Response("not found", { status: 404 });
    });
    const clearLocalSession = vi.fn();
    const client = createServerSdkClient({
      issuer: discovery.issuer,
      clientId: "client",
      clientSecret: "secret",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    const result = await client.logout({
      mode: "local",
      refreshToken: "refresh-token",
      clearLocalSession,
    });

    expect(result.localSessionCleared).toBe(true);
    expect(result.refreshTokenRevoked).toBe(false);
    expect(result.logoutUrl).toBeUndefined();
    expect(result.warnings).toEqual([
      "refresh_token_revoke_failed:oidc_http_error",
    ]);
    expect(clearLocalSession).toHaveBeenCalledOnce();
  });

  it("clears local session even when global logout URL is unsupported", async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/.well-known/openid-configuration")) {
        return Response.json({
          ...discovery,
          end_session_endpoint: undefined,
        });
      }
      return new Response("not found", { status: 404 });
    });
    const clearLocalSession = vi.fn();
    const client = createServerSdkClient({
      issuer: discovery.issuer,
      clientId: "client",
      clientSecret: "secret",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    const result = await client.logout({
      mode: "global",
      clearLocalSession,
    });

    expect(result).toEqual({
      localSessionCleared: true,
      refreshTokenRevoked: false,
      accessTokenRevoked: false,
      warnings: ["global_logout_url_failed:oidc_unsupported"],
    });
    expect(clearLocalSession).toHaveBeenCalledOnce();
  });

  it("normalizes rate limit errors", async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/.well-known/openid-configuration")) {
        return new Response("rate limited", { status: 429 });
      }
      return Response.json({});
    });
    const client = createServerSdkClient({
      issuer: discovery.issuer,
      clientId: "client",
      clientSecret: "secret",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    await expect(
      client.createAuthorizationUrl({
        redirectUri: "https://app.example.com/callback",
      }),
    ).rejects.toMatchObject({
      code: "oidc_rate_limited",
      name: "ServerSdkError",
      retryable: true,
    });
  });

  it("verifies service access token with required scope", async () => {
    const now = Math.floor(Date.now() / 1000);
    const { idToken: token, jwks } = createSignedIdToken({
      iss: discovery.issuer,
      aud: "service-api",
      sub: "svc-gateway",
      client_id: "svc-client",
      scope: "service.read service.write",
      exp: now + 300,
      nbf: now - 30,
      iat: now - 30,
    });
    const fetch = createVerifierFetch(
      jwks as { keys: Array<Record<string, unknown>> },
    );
    const verifier = createJwtVerifier({
      issuer: discovery.issuer,
      audience: "service-api",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    const verified = await verifier.verifyAccessToken(token, {
      requiredScopes: ["service.read"],
    });

    expect(verified.sub).toBe("svc-gateway");
    expect(verified.clientId).toBe("svc-client");
    expect(verified.scope).toEqual(["service.read", "service.write"]);
  });

  it("returns token_expired for expired service token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const { idToken: token, jwks } = createSignedIdToken({
      iss: discovery.issuer,
      aud: "service-api",
      sub: "svc-gateway",
      scope: "service.read",
      exp: now - 120,
      iat: now - 600,
    });
    const fetch = createVerifierFetch(
      jwks as { keys: Array<Record<string, unknown>> },
    );
    const verifier = createJwtVerifier({
      issuer: discovery.issuer,
      audience: "service-api",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    await expect(verifier.verifyAccessToken(token)).rejects.toMatchObject({
      code: "token_expired",
      name: "ServerSdkError",
    });
  });

  it("returns insufficient_scope when required scope is missing", async () => {
    const now = Math.floor(Date.now() / 1000);
    const { idToken: token, jwks } = createSignedIdToken({
      iss: discovery.issuer,
      aud: "service-api",
      sub: "svc-gateway",
      scope: "service.read",
      exp: now + 300,
      iat: now - 30,
    });
    const fetch = createVerifierFetch(
      jwks as { keys: Array<Record<string, unknown>> },
    );
    const verifier = createJwtVerifier({
      issuer: discovery.issuer,
      audience: "service-api",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    await expect(
      verifier.verifyAccessToken(token, {
        requiredScopes: ["service.write"],
      }),
    ).rejects.toMatchObject({
      code: "insufficient_scope",
      name: "ServerSdkError",
    });
  });

  it("returns missing_token when auth middleware has no bearer token", async () => {
    const middleware = createAuthMiddleware({
      issuer: discovery.issuer,
      audience: "service-api",
      fetch: vi.fn() as unknown as typeof globalThis.fetch,
    });

    await expect(middleware.authorize({})).rejects.toMatchObject({
      code: "missing_token",
      name: "ServerSdkError",
    });
  });
});
