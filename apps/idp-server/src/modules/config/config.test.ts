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
      env: { NODE_ENV: "test" },
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
  });

  it("GET /v1/admin/configs should return 403 if not admin", async () => {
    deps.rbacService.authorizationCheck.mockResolvedValue({ allowed: false });

    const res = await app.request("/v1/admin/configs", {
      headers: { Authorization: "Bearer at_mock_token_long_enough_16" },
    });
    expect(res.status).toBe(403);
  });
});
