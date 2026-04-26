import { ApiError, err, ok } from "@idp/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";

describe("OAuth Client Routes", () => {
  let deps: any;
  let app: any;

  beforeEach(() => {
    deps = {
      authService: {
        authenticateAccessToken: vi
          .fn()
          .mockResolvedValue({ userId: "admin-1" }),
      },
      rbacService: {
        authorizationCheck: vi.fn().mockResolvedValue({ allowed: true }),
      },
      oauthClientService: {
        listClients: vi.fn().mockResolvedValue(ok([])),
        createClient: vi.fn().mockResolvedValue(ok({})),
        updateClient: vi.fn().mockResolvedValue(ok({})),
        rotateSecret: vi.fn().mockResolvedValue(ok({})),
        authenticateClientBasic: vi.fn(),
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

  it("GET /v1/admin/oauth/clients", async () => {
    const res = await app.request("/v1/admin/oauth/clients", {
      headers: authHeader,
    });
    expect(res.status).toBe(200);
    expect(deps.oauthClientService.listClients).toHaveBeenCalled();
  });

  it("GET /v1/admin/oauth/clients throws if service fails", async () => {
    deps.oauthClientService.listClients.mockResolvedValue(
      err(new ApiError(500, "internal_error", "error")),
    );
    const res = await app.request("/v1/admin/oauth/clients", {
      headers: authHeader,
    });
    expect(res.status).toBe(500);
  });

  it("POST /v1/admin/oauth/clients", async () => {
    const res = await app.request("/v1/admin/oauth/clients", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Client",
        clientType: "confidential",
        tokenEndpointAuthMethod: "client_secret_basic",
        redirectUris: ["http://localhost/cb"],
        allowedScopes: ["openid"],
      }),
    });
    expect(res.status).toBe(200);
    expect(deps.oauthClientService.createClient).toHaveBeenCalled();
  });

  it("POST /v1/admin/oauth/clients throws if service fails", async () => {
    deps.oauthClientService.createClient.mockResolvedValue(
      err(new ApiError(400, "bad_request", "error")),
    );
    const res = await app.request("/v1/admin/oauth/clients", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Client",
        clientType: "confidential",
        tokenEndpointAuthMethod: "client_secret_basic",
        redirectUris: ["http://localhost/cb"],
        allowedScopes: ["openid"],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("PUT /v1/admin/oauth/clients/:clientId", async () => {
    const res = await app.request("/v1/admin/oauth/clients/c1", {
      method: "PUT",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    expect(res.status).toBe(200);
    expect(deps.oauthClientService.updateClient).toHaveBeenCalledWith(
      "admin-1",
      "c1",
      expect.any(Object),
    );
  });

  it("PUT /v1/admin/oauth/clients/:clientId throws if service fails", async () => {
    deps.oauthClientService.updateClient.mockResolvedValue(
      err(new ApiError(404, "not_found", "error")),
    );
    const res = await app.request("/v1/admin/oauth/clients/c1", {
      method: "PUT",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    expect(res.status).toBe(404);
  });

  it("POST /v1/admin/oauth/clients/:clientId/rotate-secret", async () => {
    const res = await app.request("/v1/admin/oauth/clients/c1/rotate-secret", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ gracePeriodDays: 7 }),
    });
    expect(res.status).toBe(200);
    expect(deps.oauthClientService.rotateSecret).toHaveBeenCalledWith(
      "admin-1",
      "c1",
      7,
    );
  });

  it("POST /v1/admin/oauth/clients/:clientId/rotate-secret throws if service fails", async () => {
    deps.oauthClientService.rotateSecret.mockResolvedValue(
      err(new ApiError(404, "not_found", "error")),
    );
    const res = await app.request("/v1/admin/oauth/clients/c1/rotate-secret", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ gracePeriodDays: 7 }),
    });
    expect(res.status).toBe(404);
  });

  it("POST /v1/admin/oauth/clients/:clientId/disable", async () => {
    const res = await app.request("/v1/admin/oauth/clients/c1/disable", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(deps.oauthClientService.updateClient).toHaveBeenCalledWith(
      "admin-1",
      "c1",
      { status: "disabled" },
    );
  });

  it("POST /v1/admin/oauth/clients/:clientId/disable throws if service fails", async () => {
    deps.oauthClientService.updateClient.mockResolvedValue(
      err(new ApiError(404, "not_found", "error")),
    );
    const res = await app.request("/v1/admin/oauth/clients/c1/disable", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("POST /v1/admin/oauth/clients/:clientId/enable", async () => {
    const res = await app.request("/v1/admin/oauth/clients/c1/enable", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(deps.oauthClientService.updateClient).toHaveBeenCalledWith(
      "admin-1",
      "c1",
      { status: "active" },
    );
  });

  it("POST /v1/admin/oauth/clients/:clientId/enable throws if service fails", async () => {
    deps.oauthClientService.updateClient.mockResolvedValue(
      err(new ApiError(404, "not_found", "error")),
    );
    const res = await app.request("/v1/admin/oauth/clients/c1/enable", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });
});
