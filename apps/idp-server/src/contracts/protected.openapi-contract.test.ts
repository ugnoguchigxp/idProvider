import { ApiError, ok } from "@idp/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { assertJsonResponseMatchesOpenApi } from "../test-utils/openapi-contract.js";
import { createContractDeps } from "./helpers.js";

describe("OpenAPI contract: protected and admin", () => {
  let deps: any;
  let app: any;
  const authHeader = { Authorization: "Bearer at_mock_token_long_enough_16" };

  beforeEach(() => {
    deps = createContractDeps();
    app = buildApp(deps);
  });

  it("GET /v1/me 200", async () => {
    const res = await app.request("/v1/me", { headers: authHeader });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "get",
      path: "/v1/me",
    });
  });

  it("GET /v1/me 401", async () => {
    const res = await app.request("/v1/me");
    expect(res.status).toBe(401);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "get",
      path: "/v1/me",
    });
  });

  it("POST /v1/password/change 200", async () => {
    const res = await app.request("/v1/password/change", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: "password_long_enough_8",
        newPassword: "new_password_1234",
      }),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/password/change",
    });
  });

  it("POST /v1/password/change 401", async () => {
    const res = await app.request("/v1/password/change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: "password_long_enough_8",
        newPassword: "new_password_1234",
      }),
    });
    expect(res.status).toBe(401);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/password/change",
    });
  });

  it("GET /v1/sessions 200", async () => {
    deps.sessionService.listSessions.mockResolvedValue(
      ok({
        sessions: [
          {
            id: "550e8400-e29b-41d4-a716-446655440000",
            ipAddress: "127.0.0.1",
            userAgent: "UA",
            lastSeenAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 1000).toISOString(),
            revokedAt: null,
          },
        ],
      }),
    );
    const res = await app.request("/v1/sessions", { headers: authHeader });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "get",
      path: "/v1/sessions",
    });
  });

  it("GET /v1/sessions 401", async () => {
    const res = await app.request("/v1/sessions");
    expect(res.status).toBe(401);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "get",
      path: "/v1/sessions",
    });
  });

  it("POST /v1/sessions/revoke 200", async () => {
    deps.sessionService.revokeSession.mockResolvedValue(
      ok({
        status: "revoked",
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    );
    const res = await app.request("/v1/sessions/revoke", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/sessions/revoke",
    });
  });

  it("POST /v1/sessions/revoke 401", async () => {
    const res = await app.request("/v1/sessions/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    });
    expect(res.status).toBe(401);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/sessions/revoke",
    });
  });

  it("POST /v1/sessions/revoke-all 200", async () => {
    const res = await app.request("/v1/sessions/revoke-all", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/sessions/revoke-all",
    });
  });

  it("POST /v1/sessions/revoke-all 401", async () => {
    const res = await app.request("/v1/sessions/revoke-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/sessions/revoke-all",
    });
  });

  it("POST /v1/authorization/check 200", async () => {
    const res = await app.request("/v1/authorization/check", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "manage", resource: "admin" }),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/authorization/check",
    });
  });

  it("POST /v1/authorization/check 401", async () => {
    const res = await app.request("/v1/authorization/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "manage", resource: "admin" }),
    });
    expect(res.status).toBe(401);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/authorization/check",
    });
  });

  it("POST /v1/entitlements/check 200", async () => {
    deps.rbacService.entitlementCheck.mockResolvedValue({
      allowed: true,
      reason: "matched",
    });
    const res = await app.request("/v1/entitlements/check", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ key: "feature.premium" }),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/entitlements/check",
    });
  });

  it("POST /v1/entitlements/check 401", async () => {
    const res = await app.request("/v1/entitlements/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "feature.premium" }),
    });
    expect(res.status).toBe(401);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/entitlements/check",
    });
  });

  it("POST /v1/identities/google/link 200", async () => {
    const res = await app.request("/v1/identities/google/link", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: "password_long_enough_8",
        idToken: "itok",
      }),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/identities/google/link",
    });
  });

  it("POST /v1/identities/google/link 401", async () => {
    const res = await app.request("/v1/identities/google/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: "password_long_enough_8",
        idToken: "itok",
      }),
    });
    expect(res.status).toBe(401);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/identities/google/link",
    });
  });

  it("POST /v1/identities/google/link 403", async () => {
    deps.configService.getSocialLoginConfig.mockResolvedValue({
      providerEnabled: false,
      clientId: "google-client-id",
      clientSecret: "google-client-secret",
    });
    const res = await app.request("/v1/identities/google/link", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: "password_long_enough_8",
        idToken: "itok",
      }),
    });
    expect(res.status).toBe(403);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/identities/google/link",
    });
  });

  it("POST /v1/identities/google/link 409", async () => {
    deps.userService.linkGoogleIdentity.mockRejectedValue(
      new ApiError(409, "identity_already_linked", "already linked"),
    );
    const res = await app.request("/v1/identities/google/link", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: "password_long_enough_8",
        idToken: "itok",
      }),
    });
    expect(res.status).toBe(409);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/identities/google/link",
    });
  });

  it("POST /v1/identities/google/unlink 200", async () => {
    const res = await app.request("/v1/identities/google/unlink", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: "password_long_enough_8",
        providerSubject: "sub1",
      }),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/identities/google/unlink",
    });
  });

  it("POST /v1/identities/google/unlink 401", async () => {
    const res = await app.request("/v1/identities/google/unlink", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: "password_long_enough_8",
        providerSubject: "sub1",
      }),
    });
    expect(res.status).toBe(401);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/identities/google/unlink",
    });
  });

  it("GET /v1/admin/configs 200", async () => {
    deps.rbacService.authorizationCheck.mockResolvedValue({ allowed: true });
    deps.configService.getSocialLoginConfig.mockResolvedValue({
      providerEnabled: true,
    });
    deps.configService.getNotificationConfig.mockResolvedValue({
      recipients: [],
    });
    deps.configService.getEmailTemplateConfig.mockResolvedValue({});

    const res = await app.request("/v1/admin/configs", { headers: authHeader });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "get",
      path: "/v1/admin/configs",
    });
  });

  it("GET /v1/admin/configs 403", async () => {
    deps.rbacService.authorizationCheck.mockResolvedValue({ allowed: false });
    const res = await app.request("/v1/admin/configs", { headers: authHeader });
    expect(res.status).toBe(403);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "get",
      path: "/v1/admin/configs",
    });
  });

  it("GET /v1/admin/configs 401", async () => {
    const res = await app.request("/v1/admin/configs");
    expect(res.status).toBe(401);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "get",
      path: "/v1/admin/configs",
    });
  });

  it("GET /v1/admin/oauth/clients 200", async () => {
    const res = await app.request("/v1/admin/oauth/clients", {
      headers: authHeader,
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "get",
      path: "/v1/admin/oauth/clients",
    });
  });

  it("GET /v1/admin/oauth/clients 401", async () => {
    const res = await app.request("/v1/admin/oauth/clients");
    expect(res.status).toBe(401);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "get",
      path: "/v1/admin/oauth/clients",
    });
  });

  it("POST /v1/admin/oauth/clients 200", async () => {
    const res = await app.request("/v1/admin/oauth/clients", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "My Client",
        clientType: "confidential",
        tokenEndpointAuthMethod: "client_secret_basic",
        redirectUris: ["https://example.com/callback"],
        allowedScopes: ["openid"],
      }),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/admin/oauth/clients",
    });
  });

  it("POST /v1/admin/oauth/clients/client_new/rotate-secret 200", async () => {
    const res = await app.request(
      "/v1/admin/oauth/clients/client_new/rotate-secret",
      {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ gracePeriodDays: 7 }),
      },
    );
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/admin/oauth/clients/{clientId}/rotate-secret",
    });
  });

  it("GET /v1/admin/keys 200", async () => {
    const res = await app.request("/v1/admin/keys", {
      headers: authHeader,
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "get",
      path: "/v1/admin/keys",
    });
  });

  it("POST /v1/admin/keys/rotate 200", async () => {
    const res = await app.request("/v1/admin/keys/rotate", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/admin/keys/rotate",
    });
  });

  it("POST /v1/admin/keys/rotate-emergency 200", async () => {
    const res = await app.request("/v1/admin/keys/rotate-emergency", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/admin/keys/rotate-emergency",
    });
  });

  it("GET /v1/admin/audit/logs 200", async () => {
    const res = await app.request("/v1/admin/audit/logs?limit=10", {
      headers: authHeader,
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "get",
      path: "/v1/admin/audit/logs",
    });
  });

  it("GET /v1/admin/audit/security-events 200", async () => {
    const res = await app.request("/v1/admin/audit/security-events?limit=10", {
      headers: authHeader,
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "get",
      path: "/v1/admin/audit/security-events",
    });
  });

  it("GET /v1/admin/audit/integrity 200", async () => {
    const res = await app.request("/v1/admin/audit/integrity", {
      headers: authHeader,
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "get",
      path: "/v1/admin/audit/integrity",
    });
  });

  it("POST /v1/admin/audit/exports 200", async () => {
    const res = await app.request("/v1/admin/audit/exports", {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "both",
        format: "jsonl",
      }),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/admin/audit/exports",
    });
  });
});
