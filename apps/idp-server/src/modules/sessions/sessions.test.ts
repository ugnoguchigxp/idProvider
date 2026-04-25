import { randomUUID } from "node:crypto";
import { ok } from "@idp/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";

describe("Session Routes Integration", () => {
  let deps: any;
  let app: any;

  beforeEach(() => {
    deps = {
      authService: { authenticateAccessToken: vi.fn() },
      userService: { getMe: vi.fn() },
      sessionService: {
        listSessions: vi.fn(),
        revokeSession: vi.fn(),
        revokeAllSessions: vi.fn(),
      },
      mfaService: { enrollMfa: vi.fn(), verifyMfa: vi.fn() },
      rbacService: { authorizationCheck: vi.fn() },
      webauthnService: { generateAuthenticationOptions: vi.fn() },
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true }) },
      keyStore: { getPublicJwks: vi.fn() },
      configService: {
        getSocialLoginConfig: vi.fn(),
        getNotificationConfig: vi.fn(),
        getEmailTemplateConfig: vi.fn(),
      },
      env: { NODE_ENV: "test" },
      logger: { info: vi.fn(), error: vi.fn() },
    };
    app = buildApp(deps);

    deps.authService.authenticateAccessToken.mockResolvedValue({
      userId: "u1",
      sessionId: randomUUID(),
    });
  });

  it("GET /v1/sessions should list sessions", async () => {
    deps.sessionService.listSessions.mockResolvedValue(
      ok([{ id: randomUUID(), ipAddress: "127.0.0.1" }]),
    );

    const res = await app.request("/v1/sessions", {
      headers: { Authorization: "Bearer at_mock_token_long_enough_16" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it("POST /v1/sessions/revoke should revoke session", async () => {
    const sessionId = randomUUID();
    deps.sessionService.revokeSession.mockResolvedValue(
      ok({ status: "revoked" }),
    );

    const res = await app.request("/v1/sessions/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer at_mock_token_long_enough_16",
      },
      body: JSON.stringify({ sessionId }),
    });

    expect(res.status).toBe(200);
  });
});
