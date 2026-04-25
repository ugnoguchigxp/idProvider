import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";

describe("Public Routes (via buildApp)", () => {
  let deps: any;
  let app: Hono;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ issuer: "http://localhost:3001" }),
      }),
    );

    deps = {
      env: {
        OIDC_ISSUER: "http://localhost:3001",
        OAUTH_CLIENT_ID: "client",
        OAUTH_CLIENT_SECRET: "secret",
        JWT_PRIVATE_KEY: "test",
        NODE_ENV: "test",
      },
      authService: {
        signup: vi.fn(),
        login: vi.fn(),
        refresh: vi.fn(),
        requestPasswordReset: vi.fn(),
        confirmPasswordReset: vi.fn(),
        authenticateAccessToken: vi.fn(),
        revokeByToken: vi.fn(),
        introspectToken: vi.fn(),
        requestEmailVerification: vi.fn(),
        confirmEmailVerification: vi.fn(),
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
          clientId: "",
          clientSecret: "",
        }),
        getNotificationConfig: vi.fn().mockResolvedValue({
          notificationRecipients: [],
          alertLevels: ["Critical"],
        }),
        getEmailTemplateConfig: vi.fn().mockResolvedValue({
          subject: "subject",
          body: "body {{token}}",
        }),
      },
      logger: {
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    };
    app = buildApp(deps);
  });

  it("GET /healthz returns ok", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("POST /v1/signup works", async () => {
    deps.authService.signup.mockResolvedValue({
      userId: "u-1",
      email: "x@x.com",
    });
    const res = await app.request("/v1/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123456",
        displayName: "Test",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("POST /v1/login works", async () => {
    deps.authService.login.mockResolvedValue({
      userId: "u-1",
      mfaEnabled: false,
    });
    const res = await app.request("/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123",
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "ok",
      userId: "u-1",
      mfaEnabled: false,
    });
  });

  it("POST /oauth/token works", async () => {
    deps.authService.refresh.mockResolvedValue({
      accessToken: "at",
      refreshToken: "rt",
    });
    const auth = `Basic ${Buffer.from("client:secret").toString("base64")}`;
    const res = await app.request("/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify({ refreshToken: "rt_long_enough_12345" }),
    });
    expect(res.status).toBe(200);
  });

  it("POST /v1/password/reset/request works", async () => {
    deps.authService.requestPasswordReset.mockResolvedValue({
      accepted: true,
      token: "p-token",
    });
    const res = await app.request("/v1/password/reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe("p-token");
  });

  it("POST /v1/password/reset/confirm works", async () => {
    const res = await app.request("/v1/password/reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resetToken: "rt_long_enough_12345",
        newPassword: "newpassword123456",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("GET /readyz returns ok", async () => {
    const res = await app.request("/readyz");
    expect(res.status).toBe(200);
  });

  it("POST /v1/signup throws 429 when rate limited", async () => {
    deps.rateLimiter.consume.mockResolvedValue({
      allowed: false,
      remaining: 0,
    });
    const res = await app.request("/v1/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123456",
        displayName: "Test",
      }),
    });
    expect(res.status).toBe(429);
  });

  it("GET /.well-known/openid-configuration works", async () => {
    const res = await app.request("/.well-known/openid-configuration");
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("issuer");
  });

  it("GET /.well-known/openid-configuration returns 502 on fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("network")));
    const res = await app.request("/.well-known/openid-configuration");
    expect(res.status).toBe(502);
  });

  it("POST /oauth/revocation works", async () => {
    const auth = `Basic ${Buffer.from("client:secret").toString("base64")}`;
    const res = await app.request("/oauth/revocation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify({ token: "token_long_enough_12345" }),
    });
    expect(res.status).toBe(200);
  });

  it("POST /v1/email/verify/request works", async () => {
    deps.authService.requestEmailVerification.mockResolvedValue({
      accepted: true,
      token: "v-token",
    });
    const res = await app.request("/v1/email/verify/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe("v-token");
  });

  it("POST /v1/email/verify/request hide token in production", async () => {
    deps.env.NODE_ENV = "production";
    const prodApp = buildApp(deps);
    deps.authService.requestEmailVerification.mockResolvedValue({
      accepted: true,
      token: "v-token",
    });
    const res = await prodApp.request("/v1/email/verify/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeUndefined();
  });

  it("POST /v1/password/reset/request hide token in production", async () => {
    deps.env.NODE_ENV = "production";
    const prodApp = buildApp(deps);
    deps.authService.requestPasswordReset.mockResolvedValue({
      accepted: true,
      token: "p-token",
    });
    const res = await prodApp.request("/v1/password/reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeUndefined();
  });

  it("returns 400 if validation fails", async () => {
    const res = await app.request("/v1/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "invalid-email", password: "short" }),
    });
    expect(res.status).toBe(400);
  });
});
