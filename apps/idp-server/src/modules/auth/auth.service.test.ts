import { ApiError } from "@idp/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "../../core/password.js";
import { AuthService } from "./auth.service.js";

const mockVerifyIdToken = vi.fn();
vi.mock("google-auth-library", () => {
  return {
    OAuth2Client: vi.fn().mockImplementation(() => ({
      verifyIdToken: mockVerifyIdToken,
    })),
  };
});

describe("AuthService", () => {
  let service: AuthService;
  let deps: any;

  beforeEach(() => {
    deps = {
      authRepository: { recordAttempt: vi.fn() },
      verificationRepository: {
        createEmailToken: vi.fn(),
        findEmailToken: vi.fn(),
        consumeEmailToken: vi.fn(),
        consumeValidEmailTokenByHash: vi.fn(),
        createPasswordToken: vi.fn(),
        findPasswordResetToken: vi.fn(),
        consumePasswordToken: vi.fn(),
        consumeValidPasswordTokenByHash: vi.fn(),
      },
      userRepository: {
        create: vi.fn(),
        createWithoutPassword: vi.fn(),
        findByEmail: vi.fn(),
        findWithPasswordByEmail: vi.fn(),
        findWithPasswordById: vi.fn(),
        findById: vi.fn().mockResolvedValue({ id: "u1", status: "active" }),
        update: vi.fn(),
      },
      identityRepository: {
        findByProvider: vi.fn(),
        create: vi.fn(),
      },
      sessionRepository: {
        create: vi.fn().mockResolvedValue({
          id: "s1",
          accessToken: "at",
          refreshToken: "rt",
        }),
        findByRefreshTokenHash: vi.fn(),
        findByAccessTokenHash: vi.fn(),
        findByAccessTokenHashAny: vi.fn(),
        rotateTokens: vi.fn(),
        updateLastSeen: vi.fn(),
        revoke: vi.fn(),
      },
      rbacService: {
        getAuthorizationSnapshot: vi
          .fn()
          .mockResolvedValue({ permissions: [], entitlements: {} }),
      },
      auditRepository: {
        createAuditLog: vi.fn(),
        createSecurityEvent: vi.fn(),
      },
      mfaService: {
        hasEnabledMfa: vi.fn().mockResolvedValue(false),
        verifyMfa: vi.fn(),
      },
      mfaRecoveryService: {
        consumeCode: vi.fn(),
      },
      configService: { getSocialLoginConfig: vi.fn() },
      rateLimiter: { consume: vi.fn().mockResolvedValue({ allowed: true }) },
      env: {
        ACCESS_TOKEN_TTL_SECONDS: 900,
        REFRESH_TOKEN_TTL_SECONDS: 2_592_000,
        RATE_LIMIT_MFA_RECOVERY_PER_MIN: 5,
        BOT_RISK_WINDOW_SECONDS: 600,
        BOT_RISK_LOGIN_THRESHOLD_PER_WINDOW: 20,
        BOT_RISK_MEDIUM_WATERMARK_PERCENT: 20,
      },
      logger: { info: vi.fn(), error: vi.fn() },
    };
    service = new AuthService(deps);
  });

  describe("signup", () => {
    it("should register a new user", async () => {
      deps.userRepository.findByEmail.mockResolvedValue(null);
      deps.userRepository.create.mockResolvedValue({
        id: "u1",
        email: "a@b.com",
      });
      const result = await service.signup("a@b.com", "pass1234", "Test User");
      expect(result.ok).toBe(true);
      expect(deps.userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "a@b.com",
          displayName: "Test User",
        }),
      );
      expect(deps.verificationRepository.createEmailToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "u1",
        }),
      );
    });
  });

  describe("login", () => {
    it("should return tokens on success", async () => {
      const passwordHash = await hashPassword("pass");
      deps.userRepository.findWithPasswordByEmail.mockResolvedValue({
        id: "u1",
        status: "active",
        passwordHash,
      });
      const result = await service.login("a@b.com", "pass", "127.0.0.1", "UA");
      expect(result.ok).toBe(true);
      expect(deps.auditRepository.createSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "login.success",
          userId: "u1",
        }),
      );
    });

    it("should reject login if user is inactive", async () => {
      const passwordHash = await hashPassword("pass");
      deps.userRepository.findWithPasswordByEmail.mockResolvedValue({
        id: "u1",
        status: "disabled",
        passwordHash,
      });
      await expect(
        service.login("a@b.com", "pass", "127.0.0.1", "UA"),
      ).rejects.toThrow(ApiError);
    });

    it("should enforce MFA if enabled and code is provided", async () => {
      const passwordHash = await hashPassword("pass");
      deps.userRepository.findWithPasswordByEmail.mockResolvedValue({
        id: "u1",
        status: "active",
        passwordHash,
      });
      deps.mfaService.hasEnabledMfa.mockResolvedValue(true);

      const result = await service.login("a@b.com", "pass", "127.0.0.1", "UA", {
        mfaCode: "123456",
        mfaFactorId: "fid",
      });
      expect(result.ok).toBe(true);
      expect(deps.mfaService.verifyMfa).toHaveBeenCalledWith(
        "u1",
        "fid",
        "123456",
        expect.any(Object),
      );
    });

    it("should require MFA when enabled and no method is provided", async () => {
      const passwordHash = await hashPassword("pass");
      deps.userRepository.findWithPasswordByEmail.mockResolvedValue({
        id: "u1",
        status: "active",
        passwordHash,
      });
      deps.mfaService.hasEnabledMfa.mockResolvedValue(true);

      const result = await service.login("a@b.com", "pass", "127.0.0.1", "UA");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ mfaRequired: true, userId: "u1" });
      }
    });

    it("should consume recovery code when MFA is enabled", async () => {
      const passwordHash = await hashPassword("pass");
      deps.userRepository.findWithPasswordByEmail.mockResolvedValue({
        id: "u1",
        status: "active",
        passwordHash,
      });
      deps.mfaService.hasEnabledMfa.mockResolvedValue(true);

      const result = await service.login("a@b.com", "pass", "127.0.0.1", "UA", {
        mfaRecoveryCode: "ABCDE-FGHJK-LMNPQ-RSTUV",
      });

      expect(result.ok).toBe(true);
      expect(deps.mfaRecoveryService.consumeCode).toHaveBeenCalledWith(
        "u1",
        "ABCDE-FGHJK-LMNPQ-RSTUV",
      );
    });

    it("should reject simultaneous MFA code and recovery code", async () => {
      await expect(
        service.login("a@b.com", "pass", "127.0.0.1", "UA", {
          mfaCode: "123456",
          mfaFactorId: "00000000-0000-0000-0000-000000000000",
          mfaRecoveryCode: "ABCDE-FGHJK-LMNPQ-RSTUV",
        }),
      ).rejects.toMatchObject({
        status: 400,
        code: "mfa_method_conflict",
      });
    });

    it("should throw on invalid credentials", async () => {
      deps.userRepository.findWithPasswordByEmail.mockResolvedValue(null);
      await expect(
        service.login("a@b.com", "pass", "127.0.0.1", "UA"),
      ).rejects.toThrow(ApiError);
      expect(deps.auditRepository.createSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "login.failed",
          userId: null,
        }),
      );
    });
  });

  describe("assessBotRiskForLogin", () => {
    it("returns medium when user-agent is missing", async () => {
      const level = await service.assessBotRiskForLogin({
        endpoint: "login",
        email: "a@b.com",
        ipAddress: "127.0.0.1",
        userAgent: null,
      });
      expect(level).toBe("medium");
    });

    it("returns high when limiter threshold is exceeded", async () => {
      deps.rateLimiter.consume
        .mockResolvedValueOnce({ allowed: false, remaining: 0 })
        .mockResolvedValueOnce({ allowed: true, remaining: 10 });
      const level = await service.assessBotRiskForLogin({
        endpoint: "login",
        email: "a@b.com",
        ipAddress: "127.0.0.1",
        userAgent: "UA",
      });
      expect(level).toBe("high");
    });
  });

  describe("revokeByToken", () => {
    it("should revoke session matched by access token", async () => {
      deps.sessionRepository.findByAccessTokenHash.mockResolvedValue({
        id: "s1",
      });

      const result = await service.revokeByToken("access-token");

      expect(result.ok).toBe(true);
      expect(deps.sessionRepository.revoke).toHaveBeenCalledWith("s1");
    });

    it("should revoke session matched by refresh token", async () => {
      deps.sessionRepository.findByAccessTokenHash.mockResolvedValue(null);
      deps.sessionRepository.findByRefreshTokenHash.mockResolvedValue({
        id: "s2",
      });

      const result = await service.revokeByToken("refresh-token");

      expect(result.ok).toBe(true);
      expect(deps.sessionRepository.revoke).toHaveBeenCalledWith("s2");
    });
  });

  describe("refresh", () => {
    it("should rotate refresh token and persist new token hashes", async () => {
      deps.sessionRepository.findByRefreshTokenHash.mockResolvedValue({
        id: "s1",
        userId: "u1",
        userStatus: "active",
      });
      deps.sessionRepository.rotateTokens.mockResolvedValue(true);

      const result = await service.refresh("refresh-token");

      expect(result.ok).toBe(true);
      expect(deps.sessionRepository.rotateTokens).toHaveBeenCalledWith(
        "s1",
        expect.any(String),
        expect.objectContaining({
          accessTokenHash: expect.any(String),
          refreshTokenHash: expect.any(String),
          expiresAt: expect.any(Date),
          refreshExpiresAt: expect.any(Date),
        }),
      );
    });

    it("should throw if user is inactive", async () => {
      deps.sessionRepository.findByRefreshTokenHash.mockResolvedValue({
        id: "s1",
        userId: "u1",
        userStatus: "disabled",
      });
      await expect(service.refresh("rt")).rejects.toThrow(ApiError);
    });

    it("should revoke the session if refresh rotation fails", async () => {
      deps.sessionRepository.findByRefreshTokenHash.mockResolvedValue({
        id: "s1",
        userId: "u1",
        userStatus: "active",
      });
      deps.sessionRepository.rotateTokens.mockResolvedValue(false);

      await expect(service.refresh("refresh-token")).rejects.toThrow(ApiError);
      expect(deps.sessionRepository.revoke).toHaveBeenCalledWith("s1");
      expect(deps.auditRepository.createSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "refresh_token.reuse_detected",
          userId: "u1",
        }),
      );
    });
  });

  describe("password reset", () => {
    it("should request reset even if user not found", async () => {
      deps.userRepository.findByEmail.mockResolvedValue(null);
      const result = await service.requestPasswordReset("a@b.com");
      expect(result.ok).toBe(true);
    });

    it("should request reset for existing user", async () => {
      deps.userRepository.findByEmail.mockResolvedValue({
        id: "u1",
        status: "active",
      });
      const result = await service.requestPasswordReset("a@b.com");
      expect(result.ok).toBe(true);
      expect(
        deps.verificationRepository.createPasswordToken,
      ).toHaveBeenCalled();
    });

    it("should confirm password reset", async () => {
      deps.verificationRepository.consumeValidPasswordTokenByHash.mockResolvedValue(
        { userId: "u1" },
      );
      const result = await service.confirmPasswordReset("tok", "new-pass");
      expect(result.ok).toBe(true);
      expect(deps.userRepository.update).toHaveBeenCalled();
    });

    it("should throw if token not found", async () => {
      deps.verificationRepository.consumeValidPasswordTokenByHash.mockResolvedValue(
        null,
      );
      await expect(service.confirmPasswordReset("tok", "new")).rejects.toThrow(
        ApiError,
      );
    });
  });

  describe("email verification", () => {
    it("should request email verification", async () => {
      deps.userRepository.findByEmail.mockResolvedValue({
        id: "u1",
        status: "active",
      });
      const result = await service.requestEmailVerification("a@b.com");
      expect(result.ok).toBe(true);
      expect(deps.verificationRepository.createEmailToken).toHaveBeenCalled();
    });

    it("should confirm email verification", async () => {
      deps.verificationRepository.consumeValidEmailTokenByHash.mockResolvedValue(
        { userId: "u1" },
      );
      const result = await service.confirmEmailVerification("tok");
      expect(result.ok).toBe(true);
      expect(deps.userRepository.update).toHaveBeenCalledWith("u1", {
        emailVerified: true,
      });
    });

    it("should throw if token not found", async () => {
      deps.verificationRepository.consumeValidEmailTokenByHash.mockResolvedValue(
        null,
      );
      await expect(service.confirmEmailVerification("tok")).rejects.toThrow(
        ApiError,
      );
    });
  });

  describe("introspectToken", () => {
    it("should return inactive if session not found", async () => {
      deps.sessionRepository.findByAccessTokenHashAny.mockResolvedValue(null);
      const result = await service.introspectToken("token");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.active).toBe(false);
    });

    it("should return inactive if session is revoked", async () => {
      deps.sessionRepository.findByAccessTokenHashAny.mockResolvedValue({
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 10000),
        userStatus: "active",
      });
      const result = await service.introspectToken("token");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.active).toBe(false);
    });

    it("should return active for valid session", async () => {
      deps.sessionRepository.findByAccessTokenHashAny.mockResolvedValue({
        id: "s1",
        userId: "u1",
        expiresAt: new Date(Date.now() + 10000),
        userStatus: "active",
      });
      const result = await service.introspectToken("token");
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.active).toBe(true);
    });
  });

  describe("authenticateAccessToken", () => {
    it("should return userId for valid session", async () => {
      deps.sessionRepository.findByAccessTokenHash.mockResolvedValue({
        id: "s1",
        userId: "u1",
        expiresAt: new Date(Date.now() + 10000),
        userStatus: "active",
      });
      const res = await service.authenticateAccessToken("token");
      expect(res.userId).toBe("u1");
    });

    it("should throw if session not found or expired", async () => {
      deps.sessionRepository.findByAccessTokenHash.mockResolvedValue(null);
      await expect(service.authenticateAccessToken("tok")).rejects.toThrow(
        ApiError,
      );
    });

    it("should throw if user is inactive", async () => {
      deps.sessionRepository.findByAccessTokenHash.mockResolvedValue({
        id: "s1",
        userId: "u1",
        expiresAt: new Date(Date.now() + 10000),
        userStatus: "disabled",
      });
      await expect(service.authenticateAccessToken("tok")).rejects.toThrow(
        ApiError,
      );
    });
  });

  describe("logout", () => {
    it("should revoke session", async () => {
      const result = await service.logout("sid");
      expect(result.ok).toBe(true);
      expect(deps.sessionRepository.revoke).toHaveBeenCalledWith("sid");
    });
  });

  describe("createSessionForUser", () => {
    it("should create session", async () => {
      const result = await service.createSessionForUser(
        "u1",
        "127.0.0.1",
        "UA",
      );
      expect(result.ok).toBe(true);
    });

    it("should throw if user inactive", async () => {
      deps.userRepository.findById.mockResolvedValue({ status: "disabled" });
      await expect(
        service.createSessionForUser("u1", null, null),
      ).rejects.toThrow(ApiError);
    });
  });

  describe("loginWithGoogle", () => {
    beforeEach(() => {
      mockVerifyIdToken.mockReset();
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: "g1",
          email: "g@b.com",
          email_verified: true,
        }),
      });
      deps.configService.getSocialLoginConfig.mockResolvedValue({
        providerEnabled: true,
        clientId: "cid",
      });
    });

    it("should throw if provider is disabled", async () => {
      deps.configService.getSocialLoginConfig.mockResolvedValue({
        providerEnabled: false,
      });
      await expect(
        service.loginWithGoogle({
          idToken: "tok",
          ipAddress: null,
          userAgent: null,
        }),
      ).rejects.toThrow(ApiError);
    });

    it("should reject simultaneous MFA code and recovery code", async () => {
      await expect(
        service.loginWithGoogle({
          idToken: "tok",
          ipAddress: null,
          userAgent: null,
          mfaCode: "1",
          mfaRecoveryCode: "2",
        }),
      ).rejects.toThrow(ApiError);
    });

    it("should throw if token verification fails", async () => {
      mockVerifyIdToken.mockRejectedValue(new Error("verify error"));
      await expect(
        service.loginWithGoogle({
          idToken: "tok",
          ipAddress: null,
          userAgent: null,
        }),
      ).rejects.toThrow(ApiError);
    });

    it("should throw if payload is missing email or sub", async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email_verified: true }),
      });
      await expect(
        service.loginWithGoogle({
          idToken: "tok",
          ipAddress: null,
          userAgent: null,
        }),
      ).rejects.toThrow(ApiError);
    });

    it("should create new user and identity if user doesn't exist", async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: "g1",
          email: "g@b.com",
          email_verified: true,
        }),
      });
      deps.identityRepository.findByProvider.mockResolvedValue(null);
      deps.userRepository.findByEmail.mockResolvedValue(null);
      deps.userRepository.createWithoutPassword.mockResolvedValue({
        id: "new_u1",
        status: "active",
      });
      deps.userRepository.findById.mockResolvedValue({
        id: "new_u1",
        status: "active",
      });

      const res = await service.loginWithGoogle({
        idToken: "tok",
        ipAddress: "1.2.3.4",
        userAgent: "ua",
      });

      expect(res.ok).toBe(true);
      expect(deps.userRepository.createWithoutPassword).toHaveBeenCalled();
      expect(deps.identityRepository.create).toHaveBeenCalled();
      expect(deps.sessionRepository.create).toHaveBeenCalled();
    });

    it("should link identity to existing user without identity", async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: "g1",
          email: "g@b.com",
          email_verified: true,
        }),
      });
      deps.identityRepository.findByProvider.mockResolvedValue(null);
      deps.userRepository.findByEmail.mockResolvedValue({
        id: "old_u1",
        status: "active",
      });
      deps.userRepository.findById.mockResolvedValue({
        id: "old_u1",
        status: "active",
      });

      const res = await service.loginWithGoogle({
        idToken: "tok",
        ipAddress: "1.2.3.4",
        userAgent: "ua",
      });

      expect(res.ok).toBe(true);
      expect(deps.identityRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "old_u1" }),
      );
    });

    it("should throw if linking to disabled existing user", async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: "g1",
          email: "g@b.com",
          email_verified: true,
        }),
      });
      deps.identityRepository.findByProvider.mockResolvedValue(null);
      deps.userRepository.findByEmail.mockResolvedValue({
        id: "old_u1",
        status: "disabled",
      });

      await expect(
        service.loginWithGoogle({
          idToken: "tok",
          ipAddress: null,
          userAgent: null,
        }),
      ).rejects.toThrow(ApiError);
    });

    it("should login with existing identity", async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: "g1",
          email: "g@b.com",
          email_verified: true,
        }),
      });
      deps.identityRepository.findByProvider.mockResolvedValue({
        userId: "u1",
      });
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        status: "active",
      });

      const res = await service.loginWithGoogle({
        idToken: "tok",
        ipAddress: null,
        userAgent: null,
      });
      expect(res.ok).toBe(true);
      expect(deps.sessionRepository.create).toHaveBeenCalled();
    });

    it("should enforce MFA if existing user has password and MFA enabled", async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: "g1",
          email: "g@b.com",
          email_verified: true,
        }),
      });
      deps.identityRepository.findByProvider.mockResolvedValue({
        userId: "u1",
      });
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        status: "active",
      });
      deps.userRepository.findWithPasswordById.mockResolvedValue({ id: "u1" });
      deps.mfaService.hasEnabledMfa.mockResolvedValue(true);

      const res = await service.loginWithGoogle({
        idToken: "tok",
        ipAddress: null,
        userAgent: null,
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value).toEqual({ mfaRequired: true, userId: "u1" });
      }
    });

    it("should login if existing user has password and MFA is verified", async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: "g1",
          email: "g@b.com",
          email_verified: true,
        }),
      });
      deps.identityRepository.findByProvider.mockResolvedValue({
        userId: "u1",
      });
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        status: "active",
      });
      deps.userRepository.findWithPasswordById.mockResolvedValue({ id: "u1" });
      deps.mfaService.hasEnabledMfa.mockResolvedValue(true);

      const res = await service.loginWithGoogle({
        idToken: "tok",
        ipAddress: null,
        userAgent: null,
        mfaCode: "123",
        mfaFactorId: "fid",
      });
      expect(res.ok).toBe(true);
      expect(deps.mfaService.verifyMfa).toHaveBeenCalled();
      expect(deps.sessionRepository.create).toHaveBeenCalled();
    });
  });
});
