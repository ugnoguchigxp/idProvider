import { ApiError, ok } from "@idp/shared";
import { vi } from "vitest";

export const createContractDeps = () => ({
  env: {
    OIDC_ISSUER: "https://issuer.example.com",
    OIDC_PORT: 3001,
    OAUTH_CLIENT_ID: "client",
    OAUTH_CLIENT_SECRET: "secret",
    JWT_PRIVATE_KEY: "test",
    NODE_ENV: "test",
    ACCESS_TOKEN_TTL_SECONDS: 900,
    RATE_LIMIT_LOGIN_PER_MIN: 10,
    RATE_LIMIT_SIGNUP_PER_MIN: 10,
    RATE_LIMIT_PROFILE_UPDATE_PER_10_MIN: 30,
    RATE_LIMIT_ACCOUNT_DELETE_PER_HOUR: 3,
    GOOGLE_CLIENT_ID: "google-client-id",
    WEBAUTHN_RP_ID: "localhost",
  },
  authService: {
    signup: vi.fn(),
    login: vi.fn(),
    loginWithGoogle: vi.fn(),
    refresh: vi.fn(),
    requestEmailVerification: vi.fn(),
    confirmEmailVerification: vi.fn(),
    requestPasswordReset: vi.fn(),
    confirmPasswordReset: vi.fn(),
    authenticateAccessToken: vi.fn().mockResolvedValue({
      userId: "u1",
      sessionId: "s1",
    }),
    logout: vi.fn().mockResolvedValue(ok({ status: "logged_out" })),
    revokeByToken: vi.fn().mockResolvedValue(ok({ status: "accepted" })),
    introspectToken: vi.fn().mockResolvedValue(ok({ active: false })),
    createSessionForUser: vi.fn().mockResolvedValue(
      ok({
        status: "ok",
        userId: "u1",
        accessToken: "at",
        refreshToken: "rt",
        accessExpiresAt: new Date(Date.now() + 900_000).toISOString(),
        refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        mfaEnabled: true,
      }),
    ),
  },
  userService: {
    getMe: vi.fn().mockResolvedValue(
      ok({
        userId: "u1",
        email: "test@example.com",
        status: "active",
        emailVerified: true,
        profile: {
          displayName: null,
          givenName: null,
          familyName: null,
          preferredUsername: null,
          locale: null,
          zoneinfo: null,
        },
      }),
    ),
    updateProfile: vi.fn().mockResolvedValue(
      ok({
        userId: "u1",
        email: "test@example.com",
        status: "active",
        emailVerified: true,
        profile: {
          displayName: "Taro",
          givenName: null,
          familyName: null,
          preferredUsername: "taro",
          locale: "ja-JP",
          zoneinfo: "Asia/Tokyo",
        },
      }),
    ),
    verifyCurrentPassword: vi.fn().mockResolvedValue(true),
    linkGoogleIdentity: vi.fn().mockResolvedValue(ok({ status: "linked" })),
    unlinkSocialIdentity: vi.fn().mockResolvedValue(ok({ status: "unlinked" })),
    changePassword: vi.fn().mockResolvedValue(ok({ status: "changed" })),
    findActiveUserIdByEmail: vi.fn().mockResolvedValue("u1"),
  },
  sessionService: {
    listSessions: vi.fn().mockResolvedValue(ok({ sessions: [] })),
    revokeSession: vi
      .fn()
      .mockResolvedValue(ok({ status: "revoked", sessionId: "s1" })),
    revokeAllSessions: vi.fn().mockResolvedValue(ok({ status: "revoked_all" })),
  },
  mfaService: {
    enrollMfa: vi.fn().mockResolvedValue(ok({ factorId: "f1", secret: "sec" })),
    verifyMfa: vi.fn().mockResolvedValue(ok({ status: "verified" })),
  },
  mfaRecoveryService: {
    generateCodesIfMissing: vi
      .fn()
      .mockResolvedValue(ok({ recoveryCodes: [] })),
    regenerateCodes: vi
      .fn()
      .mockResolvedValue(ok({ recoveryCodes: ["ABCDE-FGHJK-LMNPQ-RSTUV"] })),
  },
  rbacService: {
    authorizationCheck: vi.fn().mockResolvedValue({
      allowed: true,
      permissionKey: "admin:manage",
      source: "rbac",
    }),
    entitlementCheck: vi.fn().mockResolvedValue({ allowed: true }),
  },
  oauthClientService: {
    authenticateClientBasic: vi
      .fn()
      .mockImplementation(async (authorization: string | undefined) => {
        if (!authorization?.startsWith("Basic ")) {
          throw new ApiError(
            401,
            "invalid_client",
            "OAuth client authentication required",
          );
        }
        const expected = `Basic ${Buffer.from("client:secret").toString("base64")}`;
        if (authorization !== expected) {
          throw new ApiError(
            401,
            "invalid_client",
            "Invalid OAuth client credentials",
          );
        }
        return ok({ clientPkId: "c1", clientId: "client", status: "active" });
      }),
    listClients: vi.fn().mockResolvedValue(ok({ clients: [] })),
    createClient: vi.fn().mockResolvedValue(
      ok({
        status: "created",
        clientId: "client_new",
        clientSecret: "ocs_secret",
        secretHint: "cret",
      }),
    ),
    updateClient: vi
      .fn()
      .mockResolvedValue(ok({ status: "updated", clientId: "client_new" })),
    rotateSecret: vi.fn().mockResolvedValue(
      ok({
        status: "rotated",
        clientId: "client_new",
        clientSecret: "ocs_next_secret",
        secretHint: "cret",
        graceUntil: null,
      }),
    ),
  },
  webauthnService: {
    generateAuthenticationOptions: vi.fn().mockResolvedValue({
      challenge: "auth-chall",
      timeout: 60000,
      rpId: "localhost",
      allowCredentials: [],
      userVerification: "required",
    }),
    verifyAuthenticationResponse: vi.fn().mockResolvedValue({ success: true }),
    generateRegistrationOptions: vi
      .fn()
      .mockResolvedValue({ challenge: "chall" }),
    verifyRegistrationResponse: vi.fn().mockResolvedValue({ success: true }),
  },
  rateLimiter: {
    consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 10 }),
  },
  keyStore: {
    getPublicJwks: vi.fn().mockResolvedValue({ keys: [] }),
  },
  configService: {
    getSocialLoginConfig: vi.fn().mockResolvedValue({
      providerEnabled: true,
      clientId: "google-client-id",
      clientSecret: "google-client-secret",
    }),
    getNotificationConfig: vi.fn().mockResolvedValue({
      notificationRecipients: ["admin@example.com"],
      alertLevels: ["Critical"],
    }),
    getEmailTemplateConfig: vi.fn().mockResolvedValue({
      subject: "subject",
      body: "body {{token}}",
    }),
    updateSocialLoginConfig: vi.fn(),
    updateNotificationConfig: vi.fn(),
    updateEmailTemplateConfig: vi.fn(),
  },
  redis: {
    quit: vi.fn(),
  },
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
});
