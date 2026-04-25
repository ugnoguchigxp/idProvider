import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";

describe("Admin Routes (via buildApp)", () => {
  let deps: any;
  let app: Hono;

  beforeEach(() => {
    deps = {
      env: {
        OIDC_ISSUER: "http://localhost:3001",
        OAUTH_CLIENT_ID: "client",
        OAUTH_CLIENT_SECRET: "secret",
        JWT_PRIVATE_KEY: "test",
      },
      authService: {
        authenticateAccessToken: vi
          .fn()
          .mockResolvedValue({ userId: "u-1", sessionId: "s-1" }),
        authorizationCheck: vi.fn(),
      },
      configService: {
        getSocialLoginConfig: vi.fn().mockResolvedValue({
          providerEnabled: true,
          clientId: "cid",
          clientSecret: "csec",
        }),
        updateSocialLoginConfig: vi.fn(),
        getNotificationConfig: vi.fn().mockResolvedValue({
          notificationRecipients: ["admin@example.com"],
          alertLevels: ["Critical"],
        }),
        updateNotificationConfig: vi.fn(),
        getEmailTemplateConfig: vi.fn().mockResolvedValue({
          subject: "subject",
          body: "body {{token}}",
        }),
        updateEmailTemplateConfig: vi.fn(),
      },
      rateLimiter: {
        consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
      },
      keyStore: {
        getPublicJwks: vi.fn().mockResolvedValue({ keys: [] }),
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    };
    app = buildApp(deps);
  });

  const authHeader = {
    Authorization: "Bearer at_token_long_enough_12345",
  };

  it("GET /v1/admin/configs returns configs for admin", async () => {
    deps.authService.authorizationCheck.mockResolvedValue({
      allowed: true,
      permissionKey: "admin:manage",
      source: "role",
    });
    const res = await app.request("/v1/admin/configs", { headers: authHeader });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("socialLogin");
  });

  it("PUT /v1/admin/configs/social-login/google updates settings", async () => {
    deps.authService.authorizationCheck.mockResolvedValue({
      allowed: true,
      permissionKey: "admin:manage",
      source: "role",
    });
    const res = await app.request("/v1/admin/configs/social-login/google", {
      method: "PUT",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        providerEnabled: false,
        clientId: "next-client",
        clientSecret: "next-secret",
      }),
    });
    expect(res.status).toBe(200);
    expect(deps.configService.updateSocialLoginConfig).toHaveBeenCalled();
  });

  it("GET /admin escapes config values in HTML", async () => {
    deps.authService.authorizationCheck.mockResolvedValue({
      allowed: true,
      permissionKey: "admin:manage",
      source: "role",
    });
    deps.configService.getSocialLoginConfig.mockResolvedValue({
      providerEnabled: true,
      clientId: '" onfocus="alert(1)"',
      clientSecret: "<script>alert(1)</script>",
    });
    deps.configService.getNotificationConfig.mockResolvedValue({
      notificationRecipients: ['x@example.com"><img src=x onerror=alert(1)>'],
      alertLevels: ["Critical"],
    });
    deps.configService.getEmailTemplateConfig
      .mockResolvedValueOnce({
        subject: "<b>subject</b>",
        body: "</textarea><script>alert(1)</script>",
      })
      .mockResolvedValueOnce({
        subject: "reset",
        body: "<img src=x onerror=alert(1)>",
      });

    const res = await app.request("/admin", { headers: authHeader });
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&quot; onfocus=&quot;alert(1)&quot;");
    expect(html).toContain(
      "&lt;/textarea&gt;&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });
});
