import { ServerSdkError } from "@idp/server-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  createOidcClientSdk,
  normalizeOidcClientError,
  OidcClientSdk,
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

describe("oidc-client-sdk", () => {
  it("creates beginLogin URL with PKCE values", async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/.well-known/openid-configuration")) {
        return Response.json(discovery);
      }
      return new Response("not found", { status: 404 });
    });
    const client = createOidcClientSdk({
      issuer: discovery.issuer,
      clientId: "client",
      clientSecret: "secret",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    const result = await client.beginLogin({
      redirectUri: "https://app.example.com/callback",
      state: "state",
      nonce: "nonce",
    });
    const url = new URL(result.url);

    expect(url.origin + url.pathname).toBe(discovery.authorization_endpoint);
    expect(url.searchParams.get("client_id")).toBe("client");
    expect(result.codeVerifier.length).toBeGreaterThan(30);
  });

  it("normalizes server-sdk errors", () => {
    const normalized = normalizeOidcClientError(
      new ServerSdkError("oidc_rate_limited", "rate limit", true),
    );
    expect(normalized).toEqual({
      code: "oidc_rate_limited",
      message: "rate limit",
      retryable: true,
      category: "rate_limit",
    });
  });

  it("exports OidcClientSdk class", () => {
    expect(OidcClientSdk).toBeDefined();
  });

  it("normalizes unknown errors", () => {
    const normalized = normalizeOidcClientError(new Error("boom"));
    expect(normalized).toEqual({
      code: "oidc_unknown_error",
      message: "boom",
      retryable: false,
      category: "unknown",
    });
  });

  it("maps refresh token rate-limit errors", async () => {
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/.well-known/openid-configuration")) {
        return Response.json(discovery);
      }
      if (target.endsWith("/token")) {
        return new Response("rate limited", { status: 429 });
      }
      return new Response("not found", { status: 404 });
    });
    const client = createOidcClientSdk({
      issuer: discovery.issuer,
      clientId: "client",
      clientSecret: "secret",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    try {
      await client.refreshToken({ refreshToken: "rt-1" });
      expect.fail("expected refreshToken to throw");
    } catch (error) {
      const normalized = normalizeOidcClientError(error);
      expect(normalized).toEqual({
        code: "oidc_rate_limited",
        message: "OIDC request failed with status 429",
        retryable: true,
        category: "rate_limit",
      });
    }
  });

  it("maps revocation http errors as retryable network errors", async () => {
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
    const client = createOidcClientSdk({
      issuer: discovery.issuer,
      clientId: "client",
      clientSecret: "secret",
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    try {
      await client.revokeToken({
        token: "rt-1",
        tokenTypeHint: "refresh_token",
      });
      expect.fail("expected revokeToken to throw");
    } catch (error) {
      const normalized = normalizeOidcClientError(error);
      expect(normalized).toEqual({
        code: "oidc_http_error",
        message: "OIDC request failed with status 503",
        retryable: true,
        category: "network",
      });
    }
  });
});
