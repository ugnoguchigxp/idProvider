import { ApiError, ok } from "@idp/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { assertJsonResponseMatchesOpenApi } from "../test-utils/openapi-contract.js";
import { createContractDeps } from "./helpers.js";

describe("OpenAPI contract: public auth", () => {
  let deps: any;
  let app: any;

  beforeEach(() => {
    deps = createContractDeps();
    app = buildApp(deps);
  });

  it("POST /v1/signup 200", async () => {
    deps.authService.signup.mockResolvedValue(
      ok({
        user: { id: "550e8400-e29b-41d4-a716-446655440000" },
        verificationToken: "v-1",
      }),
    );

    const res = await app.request("/v1/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123456",
        displayName: "Test User",
      }),
    });

    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/signup",
    });
  });

  it("POST /v1/signup 200 production shape", async () => {
    deps.env.NODE_ENV = "production";
    deps.authService.signup.mockResolvedValue(
      ok({
        user: { id: "550e8400-e29b-41d4-a716-446655440000" },
        verificationToken: "v-1",
      }),
    );

    const res = await app.request("/v1/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123456",
        displayName: "Test User",
      }),
    });

    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/signup",
    });
  });

  it("POST /v1/signup 409", async () => {
    deps.authService.signup.mockRejectedValue(
      new ApiError(409, "email_already_exists", "Email already exists"),
    );
    const res = await app.request("/v1/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123456",
        displayName: "Test User",
      }),
    });
    expect(res.status).toBe(409);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/signup",
    });
  });

  it("POST /v1/signup 429", async () => {
    deps.rateLimiter.consume.mockResolvedValueOnce({ allowed: false });
    const res = await app.request("/v1/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123456",
        displayName: "Test User",
      }),
    });
    expect(res.status).toBe(429);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/signup",
    });
  });

  it("POST /v1/login 200 success", async () => {
    deps.authService.login.mockResolvedValue(
      ok({
        status: "ok",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        accessToken: "at",
        refreshToken: "rt",
        accessExpiresAt: new Date(Date.now() + 900_000).toISOString(),
        refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        mfaEnabled: false,
      }),
    );

    const res = await app.request("/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123456",
      }),
    });

    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/login",
    });
  });

  it("POST /v1/login 200 mfaRequired", async () => {
    deps.authService.login.mockResolvedValue(
      ok({ mfaRequired: true, userId: "550e8400-e29b-41d4-a716-446655440000" }),
    );

    const res = await app.request("/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123456",
      }),
    });

    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/login",
    });
  });

  it("POST /v1/login 401", async () => {
    deps.authService.login.mockRejectedValue(
      new ApiError(401, "invalid_credentials", "Invalid email or password"),
    );

    const res = await app.request("/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123456",
      }),
    });

    expect(res.status).toBe(401);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/login",
    });
  });

  it("POST /v1/login 429", async () => {
    deps.rateLimiter.consume.mockResolvedValueOnce({ allowed: false });
    const res = await app.request("/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "password123456",
      }),
    });
    expect(res.status).toBe(429);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/login",
    });
  });

  it("POST /v1/login/google 200 success", async () => {
    deps.authService.loginWithGoogle.mockResolvedValue(
      ok({
        status: "ok",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        accessToken: "at",
        refreshToken: "rt",
        accessExpiresAt: new Date(Date.now() + 900_000).toISOString(),
        refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        mfaEnabled: false,
      }),
    );
    const res = await app.request("/v1/login/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: "google-id-token" }),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/login/google",
    });
  });

  it("POST /v1/login/google 200 mfaRequired", async () => {
    deps.authService.loginWithGoogle.mockResolvedValue(
      ok({ mfaRequired: true, userId: "550e8400-e29b-41d4-a716-446655440000" }),
    );
    const res = await app.request("/v1/login/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: "google-id-token" }),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/login/google",
    });
  });

  it("POST /v1/login/google 400", async () => {
    deps.authService.loginWithGoogle.mockRejectedValue(
      new ApiError(400, "invalid_google_token", "Invalid Google ID token"),
    );
    const res = await app.request("/v1/login/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: "google-id-token" }),
    });
    expect(res.status).toBe(400);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/login/google",
    });
  });

  it("POST /v1/login/google 403", async () => {
    deps.authService.loginWithGoogle.mockRejectedValue(
      new ApiError(403, "provider_disabled", "Google login is disabled"),
    );
    const res = await app.request("/v1/login/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: "google-id-token" }),
    });
    expect(res.status).toBe(403);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/login/google",
    });
  });

  it("POST /oauth/token 200", async () => {
    deps.authService.refresh.mockResolvedValue(
      ok({
        userId: "550e8400-e29b-41d4-a716-446655440000",
        accessToken: "at",
        refreshToken: "rt",
        accessExpiresAt: new Date(Date.now() + 900_000).toISOString(),
        refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    );

    const res = await app.request("/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from("client:secret").toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken: "rt_mock_token_long_enough_16" }),
    });

    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/oauth/token",
    });
  });

  it("POST /oauth/token 401", async () => {
    const res = await app.request("/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "rt_mock_token_long_enough_16" }),
    });

    expect(res.status).toBe(401);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/oauth/token",
    });
  });

  it("POST /v1/token/refresh 200", async () => {
    deps.authService.refresh.mockResolvedValue(
      ok({
        userId: "550e8400-e29b-41d4-a716-446655440000",
        accessToken: "at",
        refreshToken: "rt",
        accessExpiresAt: new Date(Date.now() + 900_000).toISOString(),
        refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    );

    const res = await app.request("/v1/token/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "rt_mock_token_long_enough_16" }),
    });

    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/token/refresh",
    });
  });

  it("POST /v1/token/refresh 401", async () => {
    deps.authService.refresh.mockRejectedValue(
      new ApiError(401, "invalid_refresh_token", "Invalid refresh token"),
    );
    const res = await app.request("/v1/token/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "rt_mock_token_long_enough_16" }),
    });
    expect(res.status).toBe(401);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/token/refresh",
    });
  });

  it("POST /v1/email/verify/request 200", async () => {
    deps.authService.requestEmailVerification.mockResolvedValue(
      ok({ status: "accepted", token: "tok" }),
    );

    const res = await app.request("/v1/email/verify/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });

    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/email/verify/request",
    });
  });

  it("POST /v1/email/verify/request 429", async () => {
    deps.rateLimiter.consume.mockResolvedValueOnce({ allowed: false });
    const res = await app.request("/v1/email/verify/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });
    expect(res.status).toBe(429);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/email/verify/request",
    });
  });

  it("POST /v1/email/verify/confirm 200", async () => {
    deps.authService.confirmEmailVerification.mockResolvedValue(
      ok({ status: "verified" }),
    );
    const res = await app.request("/v1/email/verify/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "verify_token_long_enough_16" }),
    });
    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/email/verify/confirm",
    });
  });

  it("POST /v1/email/verify/confirm 400", async () => {
    deps.authService.confirmEmailVerification.mockRejectedValue(
      new ApiError(400, "invalid_token", "Invalid verification token"),
    );
    const res = await app.request("/v1/email/verify/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "verify_token_long_enough_16" }),
    });
    expect(res.status).toBe(400);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/email/verify/confirm",
    });
  });

  it("POST /v1/password/reset/request 200", async () => {
    deps.authService.requestPasswordReset.mockResolvedValue(
      ok({ status: "accepted", accepted: true, token: "ptok" }),
    );

    const res = await app.request("/v1/password/reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });

    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/password/reset/request",
    });
  });

  it("POST /v1/password/reset/request 429", async () => {
    deps.rateLimiter.consume.mockResolvedValueOnce({ allowed: false });
    const res = await app.request("/v1/password/reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });
    expect(res.status).toBe(429);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/password/reset/request",
    });
  });

  it("POST /v1/password/reset/confirm 200", async () => {
    deps.authService.confirmPasswordReset.mockResolvedValue(
      ok({ status: "reset" }),
    );

    const res = await app.request("/v1/password/reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resetToken: "reset_token_long_enough_123",
        newPassword: "new_password_1234",
      }),
    });

    expect(res.status).toBe(200);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/password/reset/confirm",
    });
  });

  it("POST /v1/password/reset/confirm 400", async () => {
    deps.authService.confirmPasswordReset.mockRejectedValue(
      new ApiError(400, "invalid_token", "Invalid or expired token"),
    );
    const res = await app.request("/v1/password/reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resetToken: "reset_token_long_enough_123",
        newPassword: "new_password_1234",
      }),
    });
    expect(res.status).toBe(400);
    await assertJsonResponseMatchesOpenApi(res, {
      method: "post",
      path: "/v1/password/reset/confirm",
    });
  });
});
