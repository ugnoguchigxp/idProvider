import { ok } from "@idp/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";

describe("MFA Routes", () => {
  let deps: any;
  let app: any;

  beforeEach(() => {
    deps = {
      authService: {
        authenticateAccessToken: vi.fn().mockResolvedValue({ userId: "u1" }),
        createSessionForUser: vi
          .fn()
          .mockResolvedValue(
            ok({ accessToken: "at", refreshToken: "rt", mfaEnabled: false }),
          ),
      },
      mfaService: {
        enrollMfa: vi
          .fn()
          .mockResolvedValue(ok({ factorId: "f1", secret: "sec" })),
        verifyMfa: vi.fn().mockResolvedValue(ok({ status: "verified" })),
      },
      mfaRecoveryService: {
        generateCodesIfMissing: vi
          .fn()
          .mockResolvedValue(ok({ recoveryCodes: [] })),
        regenerateCodes: vi
          .fn()
          .mockResolvedValue(
            ok({ recoveryCodes: ["ABCDE-FGHJK-LMNPQ-RSTUV"] }),
          ),
      },
      userService: {
        getMe: vi
          .fn()
          .mockResolvedValue(ok({ id: "u1", email: "test@example.com" })),
        findActiveUserIdByEmail: vi.fn().mockResolvedValue("u1"),
      },
      webauthnService: {
        generateAuthenticationOptions: vi
          .fn()
          .mockResolvedValue({ challenge: "auth-chall" }),
        verifyAuthenticationResponse: vi.fn().mockResolvedValue({ ok: true }),
        generateRegistrationOptions: vi
          .fn()
          .mockResolvedValue({ challenge: "chall" }),
        verifyRegistrationResponse: vi.fn().mockResolvedValue({ ok: true }),
      },
      sessionService: { listSessions: vi.fn() },
      rbacService: { authorizationCheck: vi.fn() },
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true }) },
      keyStore: { getPublicJwks: vi.fn() },
      configService: {
        getSocialLoginConfig: vi.fn(),
        getNotificationConfig: vi.fn(),
        getEmailTemplateConfig: vi.fn(),
      },
      env: { OIDC_ISSUER: "https://issuer.com" },
      logger: { info: vi.fn(), error: vi.fn() },
    };
    app = buildApp(deps);
  });

  const authHeader = "Bearer at_mock_token_long_enough_16";

  it("POST /v1/mfa/enroll should succeed", async () => {
    const res = await app.request("/v1/mfa/enroll", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.factorId).toBe("f1");
  });

  it("GET /v1/mfa/webauthn/register/options should succeed", async () => {
    const res = await app.request("/v1/mfa/webauthn/register/options", {
      headers: { Authorization: authHeader },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.challenge).toBe("chall");
  });

  it("POST /v1/mfa/webauthn/register/verify should succeed", async () => {
    const res = await app.request("/v1/mfa/webauthn/register/verify", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        response: { id: "cid", rawId: "cid", type: "public-key", response: {} },
        name: "My Key",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("POST /v1/mfa/recovery-codes/regenerate should require reauth", async () => {
    const res = await app.request("/v1/mfa/recovery-codes/regenerate", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("reauth_required");
  });

  it("POST /v1/mfa/recovery-codes/regenerate should return new codes", async () => {
    const res = await app.request("/v1/mfa/recovery-codes/regenerate", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mfaCode: "123456",
        mfaFactorId: "00000000-0000-0000-0000-000000000000",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recoveryCodes).toEqual(["ABCDE-FGHJK-LMNPQ-RSTUV"]);
  });

  it("POST /v1/mfa/webauthn/authenticate/options should return options", async () => {
    const res = await app.request("/v1/mfa/webauthn/authenticate/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.challenge).toBe("auth-chall");
  });

  it("POST /v1/mfa/webauthn/authenticate/verify should issue tokens", async () => {
    const res = await app.request("/v1/mfa/webauthn/authenticate/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        response: { id: "cid", rawId: "cid", type: "public-key", response: {} },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBe("at");
  });
});
