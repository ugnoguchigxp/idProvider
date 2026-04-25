import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";

describe("Public Routes (via buildApp)", () => {
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
        signup: vi.fn(),
        login: vi.fn(),
        refresh: vi.fn(),
        requestPasswordReset: vi.fn(),
        confirmPasswordReset: vi.fn(),
        authenticateAccessToken: vi.fn(),
        revokeByToken: vi.fn(),
        introspectToken: vi.fn(),
      },
      rateLimiter: {
        consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
      },
      logger: {
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    };
    app = buildApp(deps);
  });

  const basicAuth = `Basic ${Buffer.from("client:secret").toString("base64")}`;

  it("POST /oauth/introspection works", async () => {
    deps.authService.introspectToken.mockResolvedValue({ active: true });
    const res = await app.request("/oauth/introspection", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: basicAuth,
      },
      body: JSON.stringify({ token: "token_long_enough_12345" }),
    });
    expect(res.status).toBe(200);
  });

  it("POST /v1/token/refresh works", async () => {
    deps.authService.refresh.mockResolvedValue({
      accessToken: "at",
      refreshToken: "rt",
    });
    const res = await app.request("/v1/token/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "rt_long_enough_12345" }),
    });
    expect(res.status).toBe(200);
  });

  it("POST /v1/login throws 429 when rate limited", async () => {
    deps.rateLimiter.consume.mockResolvedValue({
      allowed: false,
      remaining: 0,
    });
    const res = await app.request("/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123",
      }),
    });
    expect(res.status).toBe(429);
  });
});
