import { ok } from "@idp/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";

describe("OAuth/OIDC conformance: oauth endpoints", () => {
  let deps: any;
  let app: any;

  beforeEach(() => {
    deps = {
      authService: {
        login: vi.fn(),
        loginWithGoogle: vi.fn(),
        refresh: vi.fn(),
        requestEmailVerification: vi.fn(),
        confirmEmailVerification: vi.fn(),
        requestPasswordReset: vi.fn(),
        confirmPasswordReset: vi.fn(),
        authenticateAccessToken: vi.fn(),
        logout: vi.fn(),
        revokeByToken: vi.fn().mockResolvedValue(ok({ status: "accepted" })),
        introspectToken: vi.fn().mockResolvedValue(ok({ active: false })),
      },
      userService: {
        getMe: vi.fn(),
      },
      sessionService: {
        listSessions: vi.fn(),
        revokeSession: vi.fn(),
      },
      mfaService: {
        enrollMfa: vi.fn(),
        verifyMfa: vi.fn(),
      },
      mfaRecoveryService: {},
      rbacService: {
        authorizationCheck: vi.fn(),
      },
      webauthnService: {
        generateAuthenticationOptions: vi.fn(),
        verifyAuthenticationResponse: vi.fn(),
      },
      rateLimiter: {
        consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
      },
      keyStore: {
        getPublicJwks: vi.fn().mockResolvedValue({ keys: [] }),
      },
      configService: {
        getSocialLoginConfig: vi.fn().mockResolvedValue({
          providerEnabled: true,
          clientId: "cid",
          clientSecret: "csec",
        }),
        getNotificationConfig: vi.fn(),
        getEmailTemplateConfig: vi.fn(),
      },
      env: {
        OIDC_ISSUER: "https://issuer.example.com",
        OAUTH_CLIENT_ID: "client",
        OAUTH_CLIENT_SECRET: "secret",
        NODE_ENV: "test",
        ACCESS_TOKEN_TTL_SECONDS: 900,
        RATE_LIMIT_SIGNUP_PER_MIN: 10,
        RATE_LIMIT_LOGIN_PER_MIN: 10,
        RATE_LIMIT_OAUTH_PER_MIN: 10,
        RATE_LIMIT_DISCOVERY_PER_MIN: 10,
      },
      logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ issuer: "https://issuer.example.com" }),
      }),
    );

    app = buildApp(deps);
  });

  it("POST /oauth/token returns 401 when client auth is missing", async () => {
    const res = await app.request("/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: "rt_mock_token_long_enough_16" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /oauth/token returns OAuthTokenResponse on success", async () => {
    deps.authService.refresh.mockResolvedValueOnce(
      ok({
        userId: "u1",
        accessToken: "at_mock_token_long_enough_16",
        refreshToken: "rt_mock_token_long_enough_16",
        accessExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        refreshExpiresAt: new Date(Date.now() + 120_000).toISOString(),
      }),
    );
    const res = await app.request("/oauth/token", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from("client:secret").toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ refreshToken: "rt_mock_token_long_enough_16" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token_type).toBe("Bearer");
    expect(body.access_token).toBe("at_mock_token_long_enough_16");
    expect(body.refresh_token).toBe("rt_mock_token_long_enough_16");
    expect(typeof body.expires_in).toBe("number");
    expect(body.expires_in).toBeGreaterThan(0);
  });

  it("POST /oauth/token returns 429 when rate limited", async () => {
    deps.rateLimiter.consume.mockResolvedValueOnce({ allowed: false });
    const res = await app.request("/oauth/token", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from("client:secret").toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ refreshToken: "rt_mock_token_long_enough_16" }),
    });
    expect(res.status).toBe(429);
  });

  it("POST /oauth/introspection returns 200 inactive response", async () => {
    const res = await app.request("/oauth/introspection", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from("client:secret").toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: "at_mock_token_long_enough_16" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ active: false });
  });

  it("POST /oauth/introspection returns 429 when rate limited", async () => {
    deps.rateLimiter.consume.mockResolvedValueOnce({ allowed: false });
    const res = await app.request("/oauth/introspection", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from("client:secret").toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: "at_mock_token_long_enough_16" }),
    });
    expect(res.status).toBe(429);
  });

  it("POST /oauth/introspection returns 401 when client auth is missing", async () => {
    const res = await app.request("/oauth/introspection", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: "at_mock_token_long_enough_16" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /oauth/revocation returns 200 accepted on success", async () => {
    deps.authService.revokeByToken.mockResolvedValueOnce(
      ok({ status: "accepted" }),
    );
    const res = await app.request("/oauth/revocation", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from("client:secret").toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: "at_mock_token_long_enough_16" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "accepted" });
  });

  it("POST /oauth/revocation returns 401 when client auth is missing", async () => {
    const res = await app.request("/oauth/revocation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: "at_mock_token_long_enough_16" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /oauth/revocation returns 429 when rate limited", async () => {
    deps.rateLimiter.consume.mockResolvedValueOnce({ allowed: false });
    const res = await app.request("/oauth/revocation", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from("client:secret").toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: "at_mock_token_long_enough_16" }),
    });
    expect(res.status).toBe(429);
  });
});
