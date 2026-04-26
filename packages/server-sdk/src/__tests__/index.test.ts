import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createServerSdkClient } from "../index.js";

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
});
