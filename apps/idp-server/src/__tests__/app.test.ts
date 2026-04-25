import { describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

const deps = {
  env: {
    NODE_ENV: "test" as const,
    PORT: 3000,
    OIDC_PORT: 3001,
    OIDC_ISSUER: "http://localhost:3001",
    OAUTH_CLIENT_ID: "local-client",
    OAUTH_CLIENT_SECRET: "local-client-secret",
    LOG_LEVEL: "info" as const,
    JWT_PRIVATE_KEY: "test",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/idp",
    REDIS_URL: "redis://localhost:6379",
    GOOGLE_CLIENT_ID: "google-client-id",
    GOOGLE_CLIENT_SECRET: "google-client-secret",
  },
  logger: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  },
  rateLimiter: {
    consume: async () => ({ allowed: true, remaining: 10 }),
  },
  authService: {
    signup: async () => ({
      userId: crypto.randomUUID(),
      email: "x@example.com",
      verificationToken: "ev_token",
    }),
    login: async () => ({
      userId: crypto.randomUUID(),
      mfaEnabled: false,
      mfaWarning: "warn",
      accessToken: "at_test",
      refreshToken: "rt_test",
      accessExpiresAt: new Date().toISOString(),
      refreshExpiresAt: new Date().toISOString(),
    }),
    refresh: async () => ({
      userId: crypto.randomUUID(),
      accessToken: "at_test",
      refreshToken: "rt_test",
      accessExpiresAt: new Date().toISOString(),
      refreshExpiresAt: new Date().toISOString(),
    }),
    requestPasswordReset: async () => ({ accepted: true }),
    confirmPasswordReset: async () => undefined,
    requestEmailVerification: async () => ({
      accepted: true,
      token: "ev_token",
    }),
    confirmEmailVerification: async () => undefined,
    authenticateAccessToken: async () => ({
      userId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
    }),
    getMe: async () => ({
      userId: crypto.randomUUID(),
      email: "x@example.com",
      status: "active",
      emailVerified: true,
    }),
    logoutBySession: async () => undefined,
    enrollMfa: async () => ({ id: crypto.randomUUID(), secret: "secret" }),
    verifyMfa: async () => undefined,
    changePassword: async () => undefined,
    authorizationCheck: async () => ({ allowed: false, permissionKey: "x:y" }),
    listSessions: async () => [],
    revokeSession: async () => undefined,
    revokeAllSessions: async () => undefined,
    verifyCurrentPassword: async () => undefined,
    linkGoogleIdentity: async () => undefined,
    unlinkGoogleIdentity: async () => undefined,
    revokeByToken: async () => undefined,
    introspectToken: async () => ({ active: false }),
  },
};

describe("buildApp", () => {
  it("returns healthz", async () => {
    const app = buildApp(deps as never);
    const response = await app.request("http://localhost/healthz");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });
});
