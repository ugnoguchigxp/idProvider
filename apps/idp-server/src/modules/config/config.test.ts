import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";

describe("Config Routes Integration", () => {
  let deps: any;
  let app: any;

  beforeEach(() => {
    deps = {
      authService: { authenticateAccessToken: vi.fn() },
      userService: { getMe: vi.fn() },
      sessionService: { listSessions: vi.fn(), revokeSession: vi.fn() },
      mfaService: { enrollMfa: vi.fn(), verifyMfa: vi.fn() },
      mfaRecoveryService: {},
      rbacService: { authorizationCheck: vi.fn() },
      webauthnService: { generateAuthenticationOptions: vi.fn() },
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true }) },
      keyStore: { getPublicJwks: vi.fn() },
      configService: {
        getSocialLoginConfig: vi.fn(),
        getNotificationConfig: vi.fn(),
        getEmailTemplateConfig: vi.fn(),
        updateSocialLoginConfig: vi.fn(),
        updateNotificationConfig: vi.fn(),
        updateEmailTemplateConfig: vi.fn(),
      },
      auditRepository: {
        createSecurityEvent: vi.fn(),
      },
      env: { NODE_ENV: "test", ADMIN_SOD_ENFORCED: true },
      logger: { info: vi.fn(), error: vi.fn() },
    };
    app = buildApp(deps);

    deps.authService.authenticateAccessToken.mockResolvedValue({
      userId: "user-1",
      sessionId: "s1",
    });
  });

  it("GET /v1/admin/configs should return configs if admin", async () => {
    deps.rbacService.authorizationCheck.mockResolvedValue({ allowed: true });
    deps.configService.getSocialLoginConfig.mockResolvedValue({});
    deps.configService.getNotificationConfig.mockResolvedValue({});
    deps.configService.getEmailTemplateConfig.mockResolvedValue({});

    const res = await app.request("/v1/admin/configs", {
      headers: { Authorization: "Bearer at_mock_token_long_enough_16" },
    });
    expect(res.status).toBe(200);
    expect(deps.rbacService.authorizationCheck).toHaveBeenCalledWith({
      userId: "user-1",
      resource: "admin.config",
      action: "read",
    });
  });

  it("GET /v1/admin/configs should return 403 if not admin", async () => {
    deps.rbacService.authorizationCheck.mockResolvedValue({ allowed: false });

    const res = await app.request("/v1/admin/configs", {
      headers: { Authorization: "Bearer at_mock_token_long_enough_16" },
    });
    expect(res.status).toBe(403);
  });

  it("PUT /v1/admin/configs/notifications should emit security event", async () => {
    deps.rbacService.authorizationCheck.mockResolvedValue({ allowed: true });
    const res = await app.request("/v1/admin/configs/notifications", {
      method: "PUT",
      headers: {
        Authorization: "Bearer at_mock_token_long_enough_16",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        notificationRecipients: ["admin@example.com"],
        alertLevels: ["Critical"],
      }),
    });
    expect(res.status).toBe(200);
    expect(deps.rbacService.authorizationCheck).toHaveBeenCalledWith({
      userId: "user-1",
      resource: "admin.config",
      action: "write",
    });
    expect(deps.auditRepository.createSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "admin.config.updated",
        userId: "user-1",
        payload: {
          key: "notifications",
        },
      }),
    );
  });
});
