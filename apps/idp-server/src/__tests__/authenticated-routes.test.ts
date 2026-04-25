import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";

describe("Authenticated Routes (via buildApp)", () => {
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
        getMe: vi.fn(),
        logoutBySession: vi.fn(),
        enrollMfa: vi.fn(),
        verifyMfa: vi.fn(),
        changePassword: vi.fn(),
        authorizationCheck: vi.fn(),
        entitlementCheck: vi.fn(),
        listSessions: vi.fn(),
        revokeSession: vi.fn(),
        revokeAllSessions: vi.fn(),
        verifyCurrentPassword: vi.fn(),
        linkGoogleIdentity: vi.fn(),
        unlinkGoogleIdentity: vi.fn(),
      },
      rateLimiter: {
        consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
      },
      keyStore: {
        getPublicJwks: vi.fn().mockResolvedValue({ keys: [] }),
      },
      logger: {
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    };
    app = buildApp(deps);
  });

  const authHeader = { Authorization: "Bearer at_token_long_enough_12345" };

  it("GET /v1/me works", async () => {
    deps.authService.getMe.mockResolvedValue({
      userId: "u-1",
      email: "x@x.com",
    });
    const res = await app.request("/v1/me", { headers: authHeader });
    expect(res.status).toBe(200);
  });

  it("POST /v1/logout works", async () => {
    const res = await app.request("/v1/logout", {
      method: "POST",
      headers: authHeader,
    });
    expect(res.status).toBe(200);
  });

  it("POST /v1/mfa/enroll works", async () => {
    deps.authService.enrollMfa.mockResolvedValue({ id: "f-1", secret: "s" });
    const res = await app.request("/v1/mfa/enroll", {
      method: "POST",
      headers: authHeader,
    });
    expect(res.status).toBe(200);
  });

  it("POST /v1/mfa/verify works", async () => {
    const res = await app.request("/v1/mfa/verify", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        factorId: "00000000-0000-0000-0000-000000000000",
        code: "123456",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("POST /v1/password/change works", async () => {
    const res = await app.request("/v1/password/change", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: "password123456",
        newPassword: "newpassword123456",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("POST /v1/authorization/check works", async () => {
    deps.authService.authorizationCheck.mockResolvedValue({
      allowed: true,
      permissionKey: "k",
    });
    const res = await app.request("/v1/authorization/check", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "read", resource: "file" }),
    });
    expect(res.status).toBe(200);
  });

  it("POST /v1/entitlements/check works", async () => {
    deps.authService.entitlementCheck.mockResolvedValue({
      granted: true,
      key: "api_access",
      source: "user",
      value: true,
      reason: "enabled",
    });
    const res = await app.request("/v1/entitlements/check", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ key: "api_access" }),
    });
    expect(res.status).toBe(200);
  });

  it("GET /v1/sessions works", async () => {
    deps.authService.listSessions.mockResolvedValue([]);
    const res = await app.request("/v1/sessions", { headers: authHeader });
    expect(res.status).toBe(200);
  });

  it("POST /v1/sessions/revoke works", async () => {
    const res = await app.request("/v1/sessions/revoke", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "00000000-0000-0000-0000-000000000000",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("POST /v1/sessions/revoke-all works", async () => {
    const res = await app.request("/v1/sessions/revoke-all", {
      method: "POST",
      headers: authHeader,
    });
    expect(res.status).toBe(200);
  });

  it("POST /v1/identities/google/link works", async () => {
    const res = await app.request("/v1/identities/google/link", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        providerSubject: "sub",
        email: "x@x.com",
        emailVerified: true,
        currentPassword: "password123456",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("POST /v1/identities/google/unlink works", async () => {
    const res = await app.request("/v1/identities/google/unlink", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        providerSubject: "sub",
        currentPassword: "password123456",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 401 if auth header missing", async () => {
    const res = await app.request("/v1/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 if auth token too short", async () => {
    const res = await app.request("/v1/me", {
      headers: { Authorization: "Bearer short" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 if validation fails", async () => {
    const res = await app.request("/v1/mfa/verify", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ factorId: "bad", code: "short" }),
    });
    expect(res.status).toBe(400);
  });
});
