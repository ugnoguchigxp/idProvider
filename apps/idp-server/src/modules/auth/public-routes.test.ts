import { ok } from "@idp/shared";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";

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
        requestEmailVerification: vi.fn(),
        confirmEmailVerification: vi.fn(),
        requestPasswordReset: vi.fn(),
        confirmPasswordReset: vi.fn(),
        authenticateAccessToken: vi.fn(),
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
        getNotificationConfig: vi.fn().mockResolvedValue({
          notificationRecipients: ["admin@example.com"],
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

  it("POST /v1/signup works", async () => {
    deps.authService.signup.mockResolvedValue(
      ok({
        user: { id: "u-1", status: "active", createdAt: new Date() },
        verificationToken: "v-1",
      }),
    );
    const res = await app.request("/v1/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123456",
        displayName: "Test User",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe("u-1");
  });

  it("POST /v1/login works", async () => {
    deps.authService.login.mockResolvedValue(
      ok({
        accessToken: "at",
        refreshToken: "rt",
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
    const body = await res.json();
    expect(body.accessToken).toBe("at");
  });
});
