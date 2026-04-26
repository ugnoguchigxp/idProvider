import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";

describe("Governance Routes", () => {
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
        getEffectivePermissions: vi
          .fn()
          .mockResolvedValue(["admin.config:read"]),
        getAuthorizationSnapshot: vi.fn().mockResolvedValue({
          permissions: ["admin.config:read"],
          entitlements: {},
        }),
        getAdminAccessSnapshot: vi.fn().mockResolvedValue([
          {
            userId: "u1",
            email: "admin@example.com",
            roles: ["system_admin"],
            permissions: ["admin.config:read"],
          },
        ]),
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
        ADMIN_SOD_ENFORCED: true,
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

  it("GET /v1/governance/permissions/me returns effective permissions", async () => {
    const res = await app.request("/v1/governance/permissions/me", {
      headers: authHeader,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe("u1");
    expect(body.permissions).toContain("admin.config:read");
  });

  it("GET /v1/admin/governance/access-snapshot returns admin access snapshot", async () => {
    const res = await app.request(
      "/v1/admin/governance/access-snapshot?limit=10",
      {
        headers: authHeader,
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.users[0].email).toBe("admin@example.com");
  });
});
