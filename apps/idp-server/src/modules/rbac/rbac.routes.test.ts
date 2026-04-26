import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";

describe("RBAC Routes", () => {
  let deps: any;
  let app: any;

  beforeEach(() => {
    deps = {
      authService: {
        authenticateAccessToken: vi.fn().mockResolvedValue({ userId: "u1" }),
      },
      rbacService: {
        authorizationCheck: vi.fn().mockResolvedValue({ allowed: true }),
        entitlementCheck: vi.fn().mockResolvedValue({ allowed: true }),
      },
      auditRepository: {
        createSecurityEvent: vi.fn(),
        createAuditLog: vi.fn(),
      },
      userService: { getMe: vi.fn() },
      sessionService: { listSessions: vi.fn(), revokeSession: vi.fn() },
      mfaService: { enrollMfa: vi.fn(), verifyMfa: vi.fn() },
      mfaRecoveryService: {},
      webauthnService: {
        generateAuthenticationOptions: vi.fn(),
        verifyAuthenticationResponse: vi.fn(),
      },
      oauthClientService: {
        authenticateClientBasic: vi.fn(),
      },
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true }) },
      keyStore: {
        getPublicJwks: vi.fn().mockResolvedValue({ keys: [] }),
      },
      configService: {
        getSocialLoginConfig: vi.fn(),
        getNotificationConfig: vi.fn(),
        getEmailTemplateConfig: vi.fn(),
      },
      env: {
        OIDC_ISSUER: "https://issuer.example.com",
        OIDC_PORT: 3001,
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

  const authHeader = { Authorization: "Bearer at_mock_token_long_enough_16" };

  describe("POST /v1/authorization/check", () => {
    it("should allow check for own subject", async () => {
      const res = await app.request("/v1/authorization/check", {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "read",
          resource: "user",
          subject: "u1", // Same as auth.userId
          organizationId: "550e8400-e29b-41d4-a716-446655440001",
          groupId: "550e8400-e29b-41d4-a716-446655440002",
        }),
      });

      expect(res.status).toBe(200);
      expect(deps.rbacService.authorizationCheck).toHaveBeenCalledWith({
        userId: "u1",
        action: "read",
        resource: "user",
        organizationId: "550e8400-e29b-41d4-a716-446655440001",
        groupId: "550e8400-e29b-41d4-a716-446655440002",
      });
    });

    it("should allow check for different subject if admin", async () => {
      // First call for admin check returns allowed: true
      deps.rbacService.authorizationCheck
        .mockResolvedValueOnce({ allowed: true }) // Admin check
        .mockResolvedValueOnce({ allowed: true }); // Actual check

      const res = await app.request("/v1/authorization/check", {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "read",
          resource: "user",
          subject: "u2", // Different from auth.userId
        }),
      });

      expect(res.status).toBe(200);
      expect(deps.rbacService.authorizationCheck).toHaveBeenCalledWith({
        userId: "u1",
        action: "manage",
        resource: "admin",
      });
      expect(deps.rbacService.authorizationCheck).toHaveBeenCalledWith({
        userId: "u2",
        action: "read",
        resource: "user",
      });
    });

    it("should forbid check for different subject if not admin", async () => {
      deps.rbacService.authorizationCheck.mockResolvedValueOnce({
        allowed: false,
      }); // Admin check

      const res = await app.request("/v1/authorization/check", {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "read",
          resource: "user",
          subject: "u2", // Different from auth.userId
        }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe("POST /v1/entitlements/check", () => {
    it("should allow entitlement check", async () => {
      const res = await app.request("/v1/entitlements/check", {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "premium_feature",
          organizationId: "550e8400-e29b-41d4-a716-446655440001",
          groupId: "550e8400-e29b-41d4-a716-446655440002",
          quantity: 1,
        }),
      });

      expect(res.status).toBe(200);
      expect(deps.rbacService.entitlementCheck).toHaveBeenCalledWith({
        userId: "u1",
        key: "premium_feature",
        organizationId: "550e8400-e29b-41d4-a716-446655440001",
        groupId: "550e8400-e29b-41d4-a716-446655440002",
        quantity: 1,
      });
    });
  });
});
