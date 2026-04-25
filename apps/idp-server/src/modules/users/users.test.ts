import { ApiError, ok } from "@idp/shared";
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
        getMe: vi.fn().mockResolvedValue(
          ok({
            userId: "u1",
            email: "test@example.com",
            status: "active",
            emailVerified: true,
            profile: {
              displayName: null,
              givenName: null,
              familyName: null,
              preferredUsername: null,
              locale: null,
              zoneinfo: null,
            },
            profileUpdatedAt: null,
          }),
        ),
        updateProfile: vi.fn().mockResolvedValue(
          ok({
            userId: "u1",
            email: "test@example.com",
            status: "active",
            emailVerified: true,
            profile: {
              displayName: "Taro",
              givenName: null,
              familyName: null,
              preferredUsername: "taro",
              locale: "ja-JP",
              zoneinfo: "Asia/Tokyo",
            },
            profileUpdatedAt: null,
          }),
        ),
        verifyCurrentPassword: vi.fn().mockResolvedValue(true),
        linkGoogleIdentity: vi.fn().mockResolvedValue(ok({ status: "linked" })),
        unlinkSocialIdentity: vi
          .fn()
          .mockResolvedValue(ok({ status: "unlinked" })),
        changePassword: vi.fn().mockResolvedValue(ok({ status: "changed" })),
      },
      sessionService: { listSessions: vi.fn() },
      mfaService: { enrollMfa: vi.fn() },
      mfaRecoveryService: {},
      rbacService: { authorizationCheck: vi.fn() },
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true }) },
      keyStore: { getPublicJwks: vi.fn() },
      configService: {
        getSocialLoginConfig: vi.fn(),
        getNotificationConfig: vi.fn(),
        getEmailTemplateConfig: vi.fn(),
      },
      env: {
        OIDC_ISSUER: "https://issuer.com",
        RATE_LIMIT_PROFILE_UPDATE_PER_10_MIN: 30,
      },
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

  it("PATCH /v1/me should succeed", async () => {
    const res = await app.request("/v1/me", {
      method: "PATCH",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        displayName: "Taro",
        preferredUsername: "taro",
        locale: "ja-JP",
        zoneinfo: "Asia/Tokyo",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("PATCH /v1/me should return 400 for empty body", async () => {
    const res = await app.request("/v1/me", {
      method: "PATCH",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("PATCH /v1/me should return 401 when unauthenticated", async () => {
    const res = await app.request("/v1/me", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ displayName: "Taro" }),
    });
    expect(res.status).toBe(401);
  });

  it("PATCH /v1/me should return 403 with cookie auth when csrf header is missing", async () => {
    const res = await app.request("/v1/me", {
      method: "PATCH",
      headers: {
        Cookie: "idp_access_token=at_mock_token_long_enough_16",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ displayName: "Taro" }),
    });
    expect(res.status).toBe(403);
  });

  it("PATCH /v1/me should return 429 when rate limited", async () => {
    deps.rateLimiter.consume.mockResolvedValueOnce({ allowed: false });
    const res = await app.request("/v1/me", {
      method: "PATCH",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ displayName: "Taro" }),
    });
    expect(res.status).toBe(429);
  });

  it("PATCH /v1/me should return 409 when username is taken", async () => {
    deps.userService.updateProfile.mockRejectedValueOnce(
      new ApiError(
        409,
        "preferred_username_taken",
        "Preferred username is already taken",
      ),
    );
    const res = await app.request("/v1/me", {
      method: "PATCH",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ preferredUsername: "taken" }),
    });
    expect(res.status).toBe(409);
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
