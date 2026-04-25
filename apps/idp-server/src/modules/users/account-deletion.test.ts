import { ApiError, ok } from "@idp/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";

describe("Account Deletion Routes", () => {
  let deps: any;
  let app: any;

  beforeEach(() => {
    deps = {
      authService: {
        authenticateAccessToken: vi.fn().mockResolvedValue({ userId: "u1" }),
      },
      userService: {
        getMe: vi
          .fn()
          .mockResolvedValue(ok({ id: "u1", email: "test@example.com" })),
        verifyCurrentPassword: vi.fn().mockResolvedValue(true),
      },
      accountDeletionService: {
        requestDeletion: vi.fn().mockResolvedValue(
          ok({
            status: "scheduled",
            deletionDueAt: "2026-05-25T00:00:00.000Z",
            alreadyDeleted: false,
          }),
        ),
      },
      sessionService: { listSessions: vi.fn() },
      mfaService: { enrollMfa: vi.fn() },
      mfaRecoveryService: {},
      rbacService: { authorizationCheck: vi.fn() },
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true }) },
      keyStore: { getPublicJwks: vi.fn() },
      configService: {},
      env: {
        OIDC_ISSUER: "https://issuer.com",
        NODE_ENV: "test",
        RATE_LIMIT_ACCOUNT_DELETE_PER_HOUR: 3,
      },
      logger: { info: vi.fn(), error: vi.fn() },
    };
    app = buildApp(deps);
  });

  const authHeader = "Bearer at_mock_token_long_enough_16";

  it("DELETE /v1/account should succeed with password", async () => {
    const res = await app.request("/v1/account", {
      method: "DELETE",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "password_long_enough_8",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("scheduled");
    expect(deps.accountDeletionService.requestDeletion).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ currentPassword: "password_long_enough_8" }),
    );
  });

  it("DELETE /v1/account should succeed with MFA", async () => {
    const res = await app.request("/v1/account", {
      method: "DELETE",
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
    expect(deps.accountDeletionService.requestDeletion).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        mfaCode: "123456",
        mfaFactorId: "00000000-0000-0000-0000-000000000000",
      }),
    );
  });

  it("DELETE /v1/account should fail if both missing", async () => {
    deps.accountDeletionService.requestDeletion.mockRejectedValueOnce(
      new ApiError(
        400,
        "reauth_required",
        "Password or MFA reauthentication is required",
      ),
    );
    const res = await app.request("/v1/account", {
      method: "DELETE",
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

  it("DELETE /v1/account should return 429 when rate limited", async () => {
    deps.rateLimiter.consume.mockResolvedValueOnce({ allowed: false });
    const res = await app.request("/v1/account", {
      method: "DELETE",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "password_long_enough_8",
      }),
    });

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("rate_limited");
  });

  it("DELETE /v1/account should return 202 for idempotent delete", async () => {
    deps.accountDeletionService.requestDeletion.mockResolvedValueOnce(
      ok({
        status: "scheduled",
        deletionDueAt: "2026-05-25T00:00:00.000Z",
        alreadyDeleted: true,
      }),
    );
    const res = await app.request("/v1/account", {
      method: "DELETE",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: "password_long_enough_8",
      }),
    });

    expect(res.status).toBe(202);
  });
});
