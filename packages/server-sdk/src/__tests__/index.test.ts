import { describe, expect, it, vi } from "vitest";
import { createServerSdkClient } from "../index.js";

const discovery = {
  issuer: "https://login.example.com",
  authorization_endpoint: "https://login.example.com/auth",
  token_endpoint: "https://login.example.com/token",
  jwks_uri: "https://login.example.com/jwks",
  userinfo_endpoint: "https://login.example.com/me",
  end_session_endpoint: "https://login.example.com/session/end",
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
