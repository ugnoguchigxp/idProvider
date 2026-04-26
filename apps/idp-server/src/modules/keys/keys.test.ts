import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";

describe("Key Management Routes", () => {
  let deps: any;
  let app: any;

  beforeEach(() => {
    deps = {
      authService: {
        authenticateAccessToken: vi
          .fn()
          .mockResolvedValue({ userId: "admin-1", sessionId: "s1" }),
      },
      userService: { getMe: vi.fn() },
      sessionService: { listSessions: vi.fn(), revokeSession: vi.fn() },
      mfaService: { enrollMfa: vi.fn(), verifyMfa: vi.fn() },
      mfaRecoveryService: {},
      rbacService: {
        authorizationCheck: vi.fn().mockResolvedValue({ allowed: true }),
      },
      oauthClientService: {
        authenticateClientBasic: vi.fn(),
      },
      webauthnService: {
        generateAuthenticationOptions: vi.fn(),
        verifyAuthenticationResponse: vi.fn(),
      },
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true }) },
      keyStore: {
        getPublicJwks: vi.fn().mockResolvedValue({ keys: [] }),
        listKeys: vi.fn().mockResolvedValue([]),
        rotateManual: vi.fn().mockResolvedValue({
          rotated: true,
          activeKid: "k2",
          previousKid: "k1",
          reason: "manual",
        }),
        rotateEmergency: vi.fn().mockResolvedValue({
          rotated: true,
          activeKid: "k3",
          previousKid: "k2",
          reason: "emergency",
        }),
      },
      configService: {
        getSocialLoginConfig: vi.fn(),
        getNotificationConfig: vi.fn(),
        getEmailTemplateConfig: vi.fn(),
      },
      auditRepository: {
        createSecurityEvent: vi.fn(),
      },
      env: {
        OIDC_ISSUER: "https://issuer.example.com",
        OIDC_PORT: 3001,
        OAUTH_CLIENT_ID: "client",
        OAUTH_CLIENT_SECRET: "secret",
        RATE_LIMIT_OAUTH_PER_MIN: 10,
        RATE_LIMIT_DISCOVERY_PER_MIN: 10,
      },
      logger: { info: vi.fn(), error: vi.fn() },
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

  const authHeader = { Authorization: "Bearer at_mock_token_long_enough_16" };

  it("GET /v1/admin/keys returns key list", async () => {
    const res = await app.request("/v1/admin/keys", { headers: authHeader });
    expect(res.status).toBe(200);
    expect(deps.keyStore.listKeys).toHaveBeenCalled();
  });

  it("POST /v1/admin/keys/rotate triggers manual rotation", async () => {
    const res = await app.request("/v1/admin/keys/rotate", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(deps.keyStore.rotateManual).toHaveBeenCalledWith("admin-1");
  });

  it("POST /v1/admin/keys/rotate-emergency requires admin", async () => {
    deps.rbacService.authorizationCheck.mockResolvedValueOnce({
      allowed: false,
    });
    const res = await app.request("/v1/admin/keys/rotate-emergency", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });
});
