import { ok } from "@idp/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";

describe("User Routes", () => {
  let deps: any;
  let app: any;

  beforeEach(() => {
    deps = {
      authService: {
        authenticateAccessToken: vi.fn().mockResolvedValue({ userId: "u1" }),
      },
      userService: {
        getMe: vi
          .fn()
          .mockResolvedValue(ok({ id: "u1", email: "test@example.com" })),
        verifyCurrentPassword: vi.fn().mockResolvedValue(true),
        linkGoogleIdentity: vi.fn().mockResolvedValue(ok({ status: "linked" })),
        unlinkSocialIdentity: vi
          .fn()
          .mockResolvedValue(ok({ status: "unlinked" })),
        changePassword: vi.fn().mockResolvedValue(ok({ status: "changed" })),
      },
      sessionService: { listSessions: vi.fn() },
      mfaService: { enrollMfa: vi.fn() },
      rbacService: { authorizationCheck: vi.fn() },
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true }) },
      keyStore: { getPublicJwks: vi.fn() },
      configService: {
        getSocialLoginConfig: vi.fn(),
        getNotificationConfig: vi.fn(),
        getEmailTemplateConfig: vi.fn(),
      },
      env: { OIDC_ISSUER: "https://issuer.com" },
      logger: { info: vi.fn(), error: vi.fn() },
    };
    app = buildApp(deps);
  });

  const authHeader = "Bearer at_mock_token_long_enough_16";

  it("GET /v1/me should succeed", async () => {
    const res = await app.request("/v1/me", {
      headers: { Authorization: authHeader },
    });
    expect(res.status).toBe(200);
  });

  it("POST /v1/password/change should succeed", async () => {
    const res = await app.request("/v1/password/change", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "password_long_enough_8",
        newPassword: "new_password_8",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("POST /v1/identities/google/link should succeed", async () => {
    const res = await app.request("/v1/identities/google/link", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "password_long_enough_8",
        idToken: "itok",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("POST /v1/identities/google/unlink should succeed", async () => {
    const res = await app.request("/v1/identities/google/unlink", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "password_long_enough_8",
        providerSubject: "sub1",
      }),
    });
    expect(res.status).toBe(200);
  });
});
