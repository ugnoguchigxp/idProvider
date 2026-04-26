import { ok } from "@idp/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";

describe("Auth Routes", () => {
  let deps: any;
  let app: any;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ issuer: "https://issuer.com" }),
      }),
    );

    deps = {
      authService: {
        login: vi.fn(),
        assessBotRiskForLogin: vi.fn().mockResolvedValue("low"),
        recordSecurityEvent: vi.fn().mockResolvedValue(undefined),
        authenticateAccessToken: vi
          .fn()
          .mockResolvedValue({ userId: "u1", sessionId: "s1" }),
        logout: vi.fn().mockResolvedValue(ok({ status: "ok" })),
        requestEmailVerification: vi
          .fn()
          .mockResolvedValue(ok({ status: "accepted", token: "tok" })),
      },
      userService: { getMe: vi.fn() },
      sessionService: { listSessions: vi.fn() },
      mfaService: { enrollMfa: vi.fn() },
      mfaRecoveryService: {},
      rbacService: { authorizationCheck: vi.fn() },
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true }) },
      keyStore: { getPublicJwks: vi.fn() },
      configService: {
        getSocialLoginConfig: vi.fn(),
        getNotificationConfig: vi.fn(),
        getEmailTemplateConfig: vi
          .fn()
          .mockResolvedValue({ subject: "Hi", body: "Verify" }),
      },
      env: {
        OIDC_ISSUER: "https://issuer.com",
        RATE_LIMIT_LOGIN_PER_MIN: 10,
        RATE_LIMIT_SIGNUP_PER_MIN: 10,
        ACCESS_TOKEN_TTL_SECONDS: 900,
        NODE_ENV: "test",
        TURNSTILE_ENABLED: false,
        TURNSTILE_REQUIRED_ACTIONS: ["signup", "password_reset"],
        TURNSTILE_ENFORCE_LOGIN_MODE: "risk",
      },
      logger: { info: vi.fn(), error: vi.fn() },
    };
    app = buildApp(deps);
  });

  const authHeader = "Bearer at_mock_token_long_enough_16";

  it("POST /v1/login should set access and csrf cookies", async () => {
    deps.authService.login.mockResolvedValue(
      ok({
        accessToken: "at_mock_token_long_enough_16",
        refreshToken: "rt_mock_token_long_enough_16",
        mfaEnabled: false,
      }),
    );

    const res = await app.request("/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123456",
      }),
    });

    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("idp_access_token=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("idp_csrf_token=");
  });

  it("POST /v1/login should not set auth cookies when mfa is required", async () => {
    deps.authService.login.mockResolvedValue(
      ok({
        mfaRequired: true,
        userId: "u1",
      }),
    );

    const res = await app.request("/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123456",
      }),
    });

    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeNull();
  });

  it("POST /v1/logout should succeed", async () => {
    const res = await app.request("/v1/logout", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
  });

  it("POST /v1/logout should clear cookies on cookie auth", async () => {
    const res = await app.request("/v1/logout", {
      method: "POST",
      headers: {
        Cookie:
          "idp_access_token=at_mock_token_long_enough_16; idp_csrf_token=csrf_1234567890123456",
        "x-csrf-token": "csrf_1234567890123456",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("idp_access_token=");
    expect(setCookie).toContain("idp_csrf_token=");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("POST /v1/email/verify/request should succeed", async () => {
    const res = await app.request("/v1/email/verify/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe("tok");
  });

  it("POST /v1/signup should require challenge when turnstile is enabled", async () => {
    deps.env.TURNSTILE_ENABLED = true;
    app = buildApp(deps);

    const res = await app.request("/v1/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123456",
        displayName: "Test User",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("challenge_required");
  });

  it("POST /v1/login should require challenge in risk mode when risk is medium", async () => {
    deps.env.TURNSTILE_ENABLED = true;
    deps.authService.assessBotRiskForLogin.mockResolvedValue("medium");
    app = buildApp(deps);

    const res = await app.request("/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123456",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("challenge_required");
  });

  it("POST /v1/login should block in high bot risk", async () => {
    deps.env.TURNSTILE_ENABLED = true;
    deps.authService.assessBotRiskForLogin.mockResolvedValue("high");
    app = buildApp(deps);

    const res = await app.request("/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123456",
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("bot_risk_blocked");
  });
});
