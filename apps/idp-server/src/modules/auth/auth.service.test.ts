import { ApiError } from "@idp/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service.js";

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
        createPasswordToken: vi.fn(),
        findPasswordResetToken: vi.fn(),
        consumePasswordToken: vi.fn(),
      },
      userRepository: {
        create: vi.fn(),
        findByEmail: vi.fn(),
        findWithPasswordByEmail: vi.fn(),
        update: vi.fn(),
      },
      sessionRepository: {
        create: vi.fn().mockResolvedValue({
          id: "s1",
          accessToken: "at",
          refreshToken: "rt",
        }),
        findByRefreshTokenHash: vi.fn(),
        findByAccessTokenHash: vi.fn(),
        rotateTokens: vi.fn(),
        updateLastSeen: vi.fn(),
        revoke: vi.fn(),
      },
      rbacService: {
        getAuthorizationSnapshot: vi
          .fn()
          .mockResolvedValue({ permissions: [], entitlements: {} }),
      },
      auditRepository: { createAuditLog: vi.fn() },
      configService: { getSocialLoginConfig: vi.fn() },
      env: {
        ACCESS_TOKEN_TTL_SECONDS: 900,
        REFRESH_TOKEN_TTL_SECONDS: 2_592_000,
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
      expect(deps.verificationRepository.createEmailToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "u1",
        }),
      );
    });
  });

  describe("login", () => {
    it("should return tokens on success", async () => {
      deps.userRepository.findWithPasswordByEmail.mockResolvedValue({
        id: "u1",
        passwordHash: "pass",
      });
      const result = await service.login("a@b.com", "pass", "127.0.0.1", "UA");
      expect(result.ok).toBe(true);
    });

    it("should throw on invalid credentials", async () => {
      deps.userRepository.findWithPasswordByEmail.mockResolvedValue(null);
      await expect(
        service.login("a@b.com", "pass", "127.0.0.1", "UA"),
      ).rejects.toThrow(ApiError);
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

    it("should revoke the session if refresh rotation fails", async () => {
      deps.sessionRepository.findByRefreshTokenHash.mockResolvedValue({
        id: "s1",
      });
      deps.sessionRepository.rotateTokens.mockResolvedValue(false);

      await expect(service.refresh("refresh-token")).rejects.toThrow(ApiError);
      expect(deps.sessionRepository.revoke).toHaveBeenCalledWith("s1");
    });
  });

  describe("password reset", () => {
    it("should request reset even if user not found", async () => {
      deps.userRepository.findByEmail.mockResolvedValue(null);
      const result = await service.requestPasswordReset("a@b.com");
      expect(result.ok).toBe(true);
    });

    it("should request reset for existing user", async () => {
      deps.userRepository.findByEmail.mockResolvedValue({ id: "u1" });
      const result = await service.requestPasswordReset("a@b.com");
      expect(result.ok).toBe(true);
      expect(
        deps.verificationRepository.createPasswordToken,
      ).toHaveBeenCalled();
    });

    it("should throw if token not found", async () => {
      deps.verificationRepository.findPasswordResetToken.mockResolvedValue(
        null,
      );
      await expect(service.confirmPasswordReset("tok", "new")).rejects.toThrow(
        ApiError,
      );
    });
  });

  describe("confirmEmailVerification", () => {
    it("should throw if token not found", async () => {
      deps.verificationRepository.findEmailToken.mockResolvedValue(null);
      await expect(service.confirmEmailVerification("tok")).rejects.toThrow(
        ApiError,
      );
    });
  });
});
