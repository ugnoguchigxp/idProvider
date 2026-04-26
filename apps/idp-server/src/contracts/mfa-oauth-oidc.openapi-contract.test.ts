import { ApiError, ok } from "@idp/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { assertJsonResponseMatchesOpenApi } from "../test-utils/openapi-contract.js";
import { createContractDeps } from "./helpers.js";

describe("OpenAPI contract: mfa + oauth/oidc", () => {
  let deps: any;
  let app: any;
  const authHeader = { Authorization: "Bearer at_mock_token_long_enough_16" };

  beforeEach(() => {
    deps = createContractDeps();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          issuer: "https://issuer.example.com",
          authorization_endpoint: "https://issuer.example.com/auth",
          token_endpoint: "https://issuer.example.com/token",
          revocation_endpoint: "https://issuer.example.com/revocation",
          introspection_endpoint: "https://issuer.example.com/introspection",
          jwks_uri: "https://issuer.example.com/jwks",
        }),
      }),
    );
    app = buildApp(deps);
  });

  it("GET /.well-known/jwks.json 200", async () => {
    deps.keyStore.getPublicJwks.mockResolvedValue({ keys: [] });
    const res = await app.request("/.well-known/jwks.json");
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "get",
      path: "/.well-known/jwks.json",
    });
  });

  it("GET /.well-known/openid-configuration 200", async () => {
    const res = await app.request("/.well-known/openid-configuration");
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "get",
      path: "/.well-known/openid-configuration",
    });
  });

  it("POST /oauth/revocation 200", async () => {
    deps.authService.revokeByToken.mockResolvedValue(
      ok({ status: "accepted" }),
    );
    const res = await app.request("/oauth/revocation", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from("client:secret").toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: "at_mock_token_long_enough_16" }),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/oauth/revocation",
    });
  });

  it("POST /oauth/revocation 401", async () => {
    const res = await app.request("/oauth/revocation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "at_mock_token_long_enough_16" }),
    });
    expect(res.status).toBe(401);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/oauth/revocation",
    });
  });

  it("POST /oauth/introspection 200", async () => {
    deps.authService.introspectToken.mockResolvedValue(ok({ active: false }));
    const res = await app.request("/oauth/introspection", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from("client:secret").toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: "at_mock_token_long_enough_16" }),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/oauth/introspection",
    });
  });

  it("POST /oauth/introspection 401", async () => {
    const res = await app.request("/oauth/introspection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "at_mock_token_long_enough_16" }),
    });
    expect(res.status).toBe(401);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/oauth/introspection",
    });
  });

  it("POST /v1/mfa/enroll 200", async () => {
    const res = await app.request("/v1/mfa/enroll", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/mfa/enroll",
    });
  });

  it("POST /v1/mfa/enroll 401", async () => {
    const res = await app.request("/v1/mfa/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/mfa/enroll",
    });
  });

  it("POST /v1/mfa/verify 200", async () => {
    const res = await app.request("/v1/mfa/verify", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        factorId: "00000000-0000-0000-0000-000000000000",
        code: "123456",
      }),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/mfa/verify",
    });
  });

  it("POST /v1/mfa/verify 400", async () => {
    const res = await app.request("/v1/mfa/verify", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        factorId: "00000000-0000-0000-0000-000000000000",
        code: "bad-code",
      }),
    });
    expect(res.status).toBe(400);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/mfa/verify",
    });
  });

  it("GET /v1/mfa/webauthn/register/options 200", async () => {
    const res = await app.request("/v1/mfa/webauthn/register/options", {
      headers: authHeader,
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "get",
      path: "/v1/mfa/webauthn/register/options",
    });
  });

  it("GET /v1/mfa/webauthn/register/options 401", async () => {
    const res = await app.request("/v1/mfa/webauthn/register/options");
    expect(res.status).toBe(401);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "get",
      path: "/v1/mfa/webauthn/register/options",
    });
  });

  it("POST /v1/mfa/webauthn/register/verify 200", async () => {
    deps.webauthnService.verifyRegistrationResponse.mockResolvedValueOnce({
      success: true,
    });
    deps.mfaRecoveryService.generateCodesIfMissing.mockResolvedValueOnce(
      ok({ recoveryCodes: [] }),
    );
    const res = await app.request("/v1/mfa/webauthn/register/verify", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "my-passkey",
        response: { id: "cid", rawId: "cid", type: "public-key", response: {} },
      }),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/mfa/webauthn/register/verify",
    });
  });

  it("POST /v1/mfa/webauthn/register/verify 400", async () => {
    deps.webauthnService.verifyRegistrationResponse.mockRejectedValueOnce(
      new ApiError(400, "invalid_webauthn", "Verification failed"),
    );
    const res = await app.request("/v1/mfa/webauthn/register/verify", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "my-passkey",
        response: { id: "cid", rawId: "cid", type: "public-key", response: {} },
      }),
    });
    expect(res.status).toBe(400);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/mfa/webauthn/register/verify",
    });
  });

  it("POST /v1/mfa/webauthn/authenticate/options 200", async () => {
    const res = await app.request("/v1/mfa/webauthn/authenticate/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/mfa/webauthn/authenticate/options",
    });
  });

  it("POST /v1/mfa/webauthn/authenticate/options 429", async () => {
    deps.rateLimiter.consume.mockResolvedValueOnce({ allowed: false });
    const res = await app.request("/v1/mfa/webauthn/authenticate/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });
    expect(res.status).toBe(429);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/mfa/webauthn/authenticate/options",
    });
  });

  it("POST /v1/mfa/webauthn/authenticate/verify 200", async () => {
    const res = await app.request("/v1/mfa/webauthn/authenticate/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        response: { id: "cid", rawId: "cid", type: "public-key", response: {} },
      }),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/mfa/webauthn/authenticate/verify",
    });
  });

  it("POST /v1/mfa/webauthn/authenticate/verify 401", async () => {
    deps.userService.findActiveUserIdByEmail.mockResolvedValueOnce(null);
    const res = await app.request("/v1/mfa/webauthn/authenticate/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        response: { id: "cid", rawId: "cid", type: "public-key", response: {} },
      }),
    });
    expect(res.status).toBe(401);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/mfa/webauthn/authenticate/verify",
    });
  });

  it("POST /v1/mfa/webauthn/authenticate/verify 429", async () => {
    deps.rateLimiter.consume.mockResolvedValueOnce({ allowed: false });
    const res = await app.request("/v1/mfa/webauthn/authenticate/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        response: { id: "cid", rawId: "cid", type: "public-key", response: {} },
      }),
    });
    expect(res.status).toBe(429);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/mfa/webauthn/authenticate/verify",
    });
  });

  it("POST /v1/mfa/recovery-codes/regenerate 200", async () => {
    const res = await app.request("/v1/mfa/recovery-codes/regenerate", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        mfaCode: "123456",
        mfaFactorId: "00000000-0000-0000-0000-000000000000",
      }),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/mfa/recovery-codes/regenerate",
    });
  });

  it("POST /v1/mfa/recovery-codes/regenerate 400", async () => {
    const res = await app.request("/v1/mfa/recovery-codes/regenerate", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/mfa/recovery-codes/regenerate",
    });
  });

  it("POST /v1/mfa/recovery-codes/regenerate 401", async () => {
    deps.mfaService.verifyMfa.mockRejectedValueOnce(
      new ApiError(401, "invalid_mfa", "Invalid MFA code"),
    );
    const res = await app.request("/v1/mfa/recovery-codes/regenerate", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        mfaCode: "123456",
        mfaFactorId: "00000000-0000-0000-0000-000000000000",
      }),
    });
    expect(res.status).toBe(401);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/mfa/recovery-codes/regenerate",
    });
  });
});
