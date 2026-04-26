import { ok } from "@idp/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";

describe("Global Routes", () => {
  let deps: any;
  let app: any;

  beforeEach(() => {
    deps = {
      keyStore: {
        getPublicJwks: vi.fn().mockResolvedValue({ keys: [] }),
      },
      env: {
        OIDC_ISSUER: "https://issuer.com",
        OIDC_PORT: 3001,
        OAUTH_CLIENT_ID: "client-id",
        OAUTH_CLIENT_SECRET: "client-secret",
      },
      authService: {
        revokeByToken: vi.fn().mockResolvedValue(ok({ status: "accepted" })),
        authenticateAccessToken: vi.fn(),
      },
      userService: {},
      sessionService: {},
      mfaService: {},
      mfaRecoveryService: {},
      rbacService: {
        authorizationCheck: vi.fn(),
      },
      webauthnService: {},
      configService: {},
      redis: {},
      logger: { info: vi.fn(), error: vi.fn() },
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true }) },
    };
    app = buildApp(deps);

    // Global fetch mock
    vi.stubGlobal("fetch", vi.fn());
  });

  it("GET /.well-known/jwks.json should return JWKS", async () => {
    const res = await app.request("/.well-known/jwks.json");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ keys: [] });
  });

  it("GET /.well-known/openid-configuration should proxy to issuer", async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ issuer: "https://issuer.com" }),
    });

    const res = await app.request("/.well-known/openid-configuration");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ issuer: "https://issuer.com" });
  });

  it("GET /.well-known/openid-configuration should handle failure", async () => {
    (fetch as any).mockResolvedValue({ ok: false });

    const res = await app.request("/.well-known/openid-configuration");
    expect(res.status).toBe(502);
  });

  it("POST /oauth/revocation should revoke provided token", async () => {
    const basic = Buffer.from("client-id:client-secret").toString("base64");
    const res = await app.request("/oauth/revocation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${basic}`,
      },
      body: JSON.stringify({ token: "at_1234567890abcdef" }),
    });

    expect(res.status).toBe(200);
    expect(deps.authService.revokeByToken).toHaveBeenCalledWith(
      "at_1234567890abcdef",
    );
    expect(await res.json()).toEqual({ status: "accepted" });
  });
});
