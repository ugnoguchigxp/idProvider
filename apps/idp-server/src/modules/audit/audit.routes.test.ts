import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";

describe("Audit Routes", () => {
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
      accountDeletionService: { requestDeletion: vi.fn() },
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
        rotateManual: vi.fn(),
        rotateEmergency: vi.fn(),
      },
      configService: {
        getSocialLoginConfig: vi.fn(),
        getNotificationConfig: vi.fn(),
        getEmailTemplateConfig: vi.fn(),
      },
      auditRepository: {
        createSecurityEvent: vi.fn().mockResolvedValue(undefined),
        createAuditLog: vi.fn().mockResolvedValue(undefined),
        listAuditLogs: vi.fn().mockResolvedValue({
          items: [
            {
              id: "00000000-0000-0000-0000-000000000001",
              actorUserId: "admin-1",
              action: "admin.audit.export.create",
              resourceType: "audit_export",
              resourceId: "exp-1",
              payload: { kind: "both" },
              prevHash: null,
              entryHash: "hash-1",
              integrityVersion: 1,
              createdAt: new Date("2026-04-26T00:00:00.000Z"),
            },
          ],
          nextCursor: null,
        }),
        listSecurityEvents: vi.fn().mockResolvedValue({
          items: [
            {
              id: "00000000-0000-0000-0000-000000000002",
              userId: "u1",
              eventType: "login.success",
              payload: { method: "password" },
              createdAt: new Date("2026-04-26T00:10:00.000Z"),
            },
          ],
          nextCursor: null,
        }),
        verifyIntegrityRange: vi.fn().mockResolvedValue({
          ok: true,
          checked: 1,
          firstId: "00000000-0000-0000-0000-000000000001",
          lastId: "00000000-0000-0000-0000-000000000001",
          brokenAt: null,
          reason: null,
        }),
      },
      env: {
        OIDC_ISSUER: "https://issuer.example.com",
        OIDC_PORT: 3001,
        OAUTH_CLIENT_ID: "client",
        OAUTH_CLIENT_SECRET: "secret",
        RATE_LIMIT_OAUTH_PER_MIN: 10,
        RATE_LIMIT_DISCOVERY_PER_MIN: 10,
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

  it("GET /v1/admin/audit/logs returns logs", async () => {
    const res = await app.request("/v1/admin/audit/logs?limit=10", {
      headers: authHeader,
    });

    expect(res.status).toBe(200);
    expect(deps.auditRepository.listAuditLogs).toHaveBeenCalled();
  });

  it("GET /v1/admin/audit/security-events returns events", async () => {
    const res = await app.request("/v1/admin/audit/security-events", {
      headers: authHeader,
    });

    expect(res.status).toBe(200);
    expect(deps.auditRepository.listSecurityEvents).toHaveBeenCalled();
  });

  it("GET /v1/admin/audit/integrity returns result", async () => {
    const res = await app.request("/v1/admin/audit/integrity", {
      headers: authHeader,
    });

    expect(res.status).toBe(200);
    expect(deps.auditRepository.verifyIntegrityRange).toHaveBeenCalled();
  });

  it("POST /v1/admin/audit/exports creates export and audit event", async () => {
    deps.auditRepository.listAuditLogs.mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    deps.auditRepository.listSecurityEvents.mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    const res = await app.request("/v1/admin/audit/exports", {
      method: "POST",
      headers: {
        ...authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ kind: "both", format: "jsonl" }),
    });

    expect(res.status).toBe(200);
    expect(deps.auditRepository.createSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "audit.export.generated",
      }),
    );
    expect(deps.auditRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.audit.export.create",
      }),
    );
  });

  it("GET /v1/admin/audit/logs requires admin", async () => {
    deps.rbacService.authorizationCheck.mockResolvedValueOnce({
      allowed: false,
    });

    const res = await app.request("/v1/admin/audit/logs", {
      headers: authHeader,
    });

    expect(res.status).toBe(403);
  });
});
