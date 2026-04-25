import { ApiError } from "@idp/shared";
import argon2 from "argon2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../auth-service.js";

// Mock argon2
vi.mock("argon2", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed_password"),
    verify: vi.fn().mockResolvedValue(true),
    argon2id: 2,
  },
}));

// Mock otplib
vi.mock("otplib", () => ({
  authenticator: {
    keyuri: vi.fn().mockReturnValue("otpauth://..."),
    check: vi.fn().mockReturnValue(true),
  },
}));

describe("AuthService", () => {
  let db: any;
  let service: AuthService;

  beforeEach(() => {
    db = {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    };
    service = new AuthService(db);
  });

  describe("signup", () => {
    it("successfully signs up a new user", async () => {
      db.returning.mockResolvedValueOnce([{ id: "user-1" }]);

      const result = await service.signup({
        email: "test@example.com",
        password: "password123456",
        displayName: "Test User",
        ipAddress: "127.0.0.1",
      });

      expect(result).toEqual({
        userId: "user-1",
        email: "test@example.com",
        verificationToken: expect.any(String),
      });
      expect(db.insert).toHaveBeenCalled();
      expect(argon2.hash).toHaveBeenCalled();
    });

    it("throws 409 if email already exists", async () => {
      db.returning.mockRejectedValueOnce({ code: "23505" });

      await expect(
        service.signup({
          email: "test@example.com",
          password: "password123456",
          displayName: "Test User",
          ipAddress: "127.0.0.1",
        }),
      ).rejects.toThrow(ApiError);
    });
  });

  describe("login", () => {
    it("successfully logs in a user", async () => {
      db.limit.mockResolvedValueOnce([
        { userId: "user-1", passwordHash: "hash", emailVerified: true },
      ]); // User/Email lookup
      db.limit.mockResolvedValueOnce([]); // MFA factors check (not enabled)
      db.values.mockResolvedValueOnce([]); // Session creation

      const result = await service.login({
        email: "test@example.com",
        password: "password123",
        ipAddress: "127.0.0.1",
        userAgent: "ua",
      });

      expect(result.userId).toBe("user-1");
      expect(result.mfaEnabled).toBe(false);
      expect(result.accessToken).toBeDefined();
    });

    it("throws 401 if user not found", async () => {
      db.limit.mockResolvedValueOnce([]); // User not found

      await expect(
        service.login({
          email: "notfound@example.com",
          password: "password",
          ipAddress: "127.0.0.1",
          userAgent: "ua",
        }),
      ).rejects.toThrow(ApiError);
    });

    it("throws 401 if password invalid", async () => {
      db.limit.mockResolvedValueOnce([
        { userId: "u-1", passwordHash: "h", emailVerified: true },
      ]);
      argon2.verify.mockResolvedValueOnce(false);
      await expect(
        service.login({
          email: "x@x.com",
          password: "p",
          ipAddress: "1",
          userAgent: "ua",
        }),
      ).rejects.toThrow(ApiError);
    });

    it("throws 403 if email not verified", async () => {
      db.limit.mockResolvedValueOnce([
        { userId: "u-1", passwordHash: "h", emailVerified: false },
      ]);
      argon2.verify.mockResolvedValueOnce(true);
      await expect(
        service.login({
          email: "x@x.com",
          password: "p",
          ipAddress: "1",
          userAgent: "ua",
        }),
      ).rejects.toThrow(ApiError);
    });
  });

  describe("authenticateAccessToken", () => {
    it("successfully authenticates a valid token", async () => {
      db.limit.mockResolvedValueOnce([
        {
          sessionId: "sess-1",
          userId: "user-1",
          expiresAt: new Date(Date.now() + 10000),
        },
      ]);

      const result = await service.authenticateAccessToken("at_token");
      expect(result).toEqual({ userId: "user-1", sessionId: "sess-1" });
    });

    it("throws 401 if token is invalid or expired", async () => {
      db.limit.mockResolvedValueOnce([]);
      await expect(
        service.authenticateAccessToken("bad_token_long_enough_12345"),
      ).rejects.toThrow(ApiError);
    });
  });

  describe("refresh", () => {
    it("successfully refreshes tokens", async () => {
      db.limit.mockResolvedValueOnce([
        {
          sessionId: "sess-1",
          userId: "user-1",
          refreshExpiresAt: new Date(Date.now() + 10000),
        },
      ]);
      db.returning.mockResolvedValueOnce([{ id: "sess-1" }]);

      const result = await service.refresh("rt_token_long_enough_12345");
      expect(result.accessToken).toBeDefined();
    });

    it("throws 401 if refresh token reuse detected", async () => {
      db.limit.mockResolvedValueOnce([
        {
          sessionId: "sess-1",
          userId: "user-1",
          refreshExpiresAt: new Date(Date.now() + 10000),
        },
      ]);
      db.returning.mockResolvedValueOnce([]); // No rows updated means reuse or already revoked
      await expect(
        service.refresh("rt_token_long_enough_12345"),
      ).rejects.toThrow(ApiError);
    });
  });

  describe("getMe", () => {
    it("returns user profile", async () => {
      db.limit.mockResolvedValueOnce([
        {
          userId: "user-1",
          email: "x@x.com",
          status: "active",
          emailVerified: true,
        },
      ]);
      const result = await service.getMe("user-1");
      expect(result.userId).toBe("user-1");
    });
  });

  describe("MFA", () => {
    it("enrollMfa returns provisioning URI", async () => {
      db.returning.mockResolvedValueOnce([
        { id: "factor-1", secret: "secret" },
      ]);
      db.limit.mockResolvedValueOnce([{ userId: "user-1", email: "x@x.com" }]);

      const result = await service.enrollMfa("user-1");
      expect(result.provisioningUri).toBeDefined();
    });

    it("enrollMfa throws if insertion fails", async () => {
      db.returning.mockResolvedValueOnce([]); // No rows returned
      await expect(service.enrollMfa("user-1")).rejects.toThrow(ApiError);
    });

    it("verifyMfa enables factor", async () => {
      db.limit.mockResolvedValueOnce([{ secret: "secret" }]);
      db.returning.mockResolvedValueOnce([{ id: "factor-1" }]);

      await expect(
        service.verifyMfa("user-1", "factor-1", "123456"),
      ).resolves.not.toThrow();
    });

    it("verifyMfa throws if code is invalid", async () => {
      db.limit.mockResolvedValueOnce([{ secret: "secret" }]);
      const otplib = await import("otplib");
      (otplib.authenticator.check as any).mockReturnValueOnce(false);
      await expect(
        service.verifyMfa("user-1", "factor-1", "111111"),
      ).rejects.toThrow(ApiError);
    });

    it("verifyMfa throws if factor update fails", async () => {
      db.limit.mockResolvedValueOnce([{ secret: "secret" }]);
      const otplib = await import("otplib");
      (otplib.authenticator.check as any).mockReturnValueOnce(true);
      db.returning.mockResolvedValueOnce([]); // No rows updated
      await expect(
        service.verifyMfa("user-1", "factor-1", "123456"),
      ).rejects.toThrow(ApiError);
    });

    it("verifyMfa throws if code format is invalid", async () => {
      await expect(
        service.verifyMfa("user-1", "factor-1", "abc"),
      ).rejects.toThrow(ApiError);
    });

    it("verifyMfa throws if factor not found", async () => {
      db.limit.mockResolvedValueOnce([]);
      await expect(
        service.verifyMfa("user-1", "factor-1", "123456"),
      ).rejects.toThrow(ApiError);
    });
  });

  describe("Password Management", () => {
    it("changePassword updates password and revokes sessions", async () => {
      db.limit.mockResolvedValueOnce([{ passwordHash: "hash" }]); // verify current
      await service.changePassword({
        userId: "user-1",
        currentPassword: "cur",
        newPassword: "newpassword123",
      });
      expect(db.update).toHaveBeenCalled();
    });

    it("changePassword throws if current password invalid", async () => {
      db.limit.mockResolvedValueOnce([{ passwordHash: "hash" }]);
      argon2.verify.mockResolvedValueOnce(false);
      await expect(
        service.changePassword({
          userId: "user-1",
          currentPassword: "cur",
          newPassword: "new",
        }),
      ).rejects.toThrow(ApiError);
    });

    it("changePassword throws if password record not found", async () => {
      db.limit.mockResolvedValueOnce([]);
      await expect(
        service.changePassword({
          userId: "user-1",
          currentPassword: "cur",
          newPassword: "new",
        }),
      ).rejects.toThrow(ApiError);
    });

    it("requestPasswordReset creates token if user exists", async () => {
      db.limit.mockResolvedValueOnce([{ userId: "user-1" }]);
      const result = await service.requestPasswordReset("test@example.com");
      expect(result.accepted).toBe(true);
      expect(db.insert).toHaveBeenCalled();
    });

    it("requestPasswordReset returns accepted if user not found", async () => {
      db.limit.mockResolvedValueOnce([]);
      const result = await service.requestPasswordReset("notfound@x.com");
      expect(result.accepted).toBe(true);
    });

    it("confirmPasswordReset updates password", async () => {
      db.limit.mockResolvedValueOnce([{ id: "token-1", userId: "user-1" }]);
      await service.confirmPasswordReset({
        resetToken: "token",
        newPassword: "newpassword123",
      });
      expect(db.update).toHaveBeenCalled();
    });

    it("confirmPasswordReset throws if token invalid", async () => {
      db.limit.mockResolvedValueOnce([]);
      await expect(
        service.confirmPasswordReset({
          resetToken: "invalid",
          newPassword: "p",
        }),
      ).rejects.toThrow(ApiError);
    });
  });

  describe("Session Management", () => {
    it("listSessions returns user sessions", async () => {
      db.orderBy.mockResolvedValueOnce([{ id: "sess-1" }]);
      const result = await service.listSessions("user-1");
      expect(result).toHaveLength(1);
    });

    it("revokeSession updates session", async () => {
      await service.revokeSession("user-1", "sess-1");
      expect(db.update).toHaveBeenCalled();
    });

    it("revokeAllSessions updates all user sessions", async () => {
      await service.revokeAllSessions("user-1");
      expect(db.update).toHaveBeenCalled();
    });

    it("introspectToken returns status", async () => {
      db.limit.mockResolvedValueOnce([
        {
          userId: "user-1",
          sessionId: "sess-1",
          expiresAt: new Date(Date.now() + 10000),
          revokedAt: null,
        },
      ]);
      const result = await service.introspectToken("token");
      expect(result.active).toBe(true);
    });
  });

  describe("Email Verification", () => {
    it("confirmEmailVerification verifies email", async () => {
      db.limit.mockResolvedValueOnce([{ id: "v-1", userId: "user-1" }]);
      await service.confirmEmailVerification("valid-token");
      expect(db.update).toHaveBeenCalledTimes(2);
    });

    it("confirmEmailVerification throws if token invalid", async () => {
      db.limit.mockResolvedValueOnce([]);
      await expect(service.confirmEmailVerification("invalid")).rejects.toThrow(
        ApiError,
      );
    });

    it("requestEmailVerification generates token", async () => {
      db.limit.mockResolvedValueOnce([{ userId: "user-1", isVerified: false }]);
      const result = await service.requestEmailVerification("test@example.com");
      expect(result.accepted).toBe(true);
      expect(result.token).toBeDefined();
    });

    it("requestEmailVerification returns accepted if user not found", async () => {
      db.limit.mockResolvedValueOnce([]);
      const result = await service.requestEmailVerification("notfound@x.com");
      expect(result.accepted).toBe(true);
    });

    it("requestEmailVerification returns accepted if already verified", async () => {
      db.limit.mockResolvedValueOnce([{ userId: "user-1", isVerified: true }]);
      const result = await service.requestEmailVerification("verified@x.com");
      expect(result.accepted).toBe(true);
    });
  });

  describe("Authorization", () => {
    it("authorizationCheck returns allowed status", async () => {
      db.limit.mockResolvedValueOnce([{ permissionId: "p-1" }]);
      const result = await service.authorizationCheck({
        userId: "user-1",
        action: "read",
        resource: "file",
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe("External Identity", () => {
    it("linkGoogleIdentity links account", async () => {
      db.limit.mockResolvedValueOnce([]); // No existing mapping
      await service.linkGoogleIdentity({
        userId: "user-1",
        providerSubject: "sub",
        email: "x@x.com",
        emailVerified: true,
      });
      expect(db.insert).toHaveBeenCalled();
    });

    it("linkGoogleIdentity throws if already linked to another user", async () => {
      db.limit.mockResolvedValueOnce([{ id: "m-1", userId: "other-user" }]);
      await expect(
        service.linkGoogleIdentity({
          userId: "user-1",
          providerSubject: "sub",
          email: "x@x.com",
          emailVerified: true,
        }),
      ).rejects.toThrow(ApiError);
    });

    it("linkGoogleIdentity throws if email not verified", async () => {
      await expect(
        service.linkGoogleIdentity({
          userId: "user-1",
          providerSubject: "sub",
          email: "x@x.com",
          emailVerified: false,
        }),
      ).rejects.toThrow(ApiError);
    });

    it("unlinkGoogleIdentity deletes mapping", async () => {
      await service.unlinkGoogleIdentity("user-1", "sub");
      expect(db.delete).toHaveBeenCalled();
    });

    describe("introspectToken", () => {
      it("returns active: false for non-existent token", async () => {
        db.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        } as any);

        const result = await service.introspectToken("invalid-token");
        expect(result).toEqual({ active: false });
      });

      it("returns active: false for revoked/expired token", async () => {
        db.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  userId: "user-1",
                  sessionId: "session-1",
                  expiresAt: new Date(Date.now() - 1000), // Expired
                  revokedAt: null,
                },
              ]),
            }),
          }),
        } as any);

        const result = await service.introspectToken("expired-token");
        expect(result).toEqual({ active: false });
      });

      it("returns active: true for valid token", async () => {
        const expiresAt = new Date(Date.now() + 10000);
        db.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  userId: "user-1",
                  sessionId: "session-1",
                  expiresAt,
                  revokedAt: null,
                },
              ]),
            }),
          }),
        } as any);

        const result = await service.introspectToken("valid-token");
        expect(result).toEqual({
          active: true,
          sub: "user-1",
          sid: "session-1",
          exp: Math.floor(expiresAt.getTime() / 1000),
        });
      });
    });

    describe("session management", () => {
      it("lists sessions", async () => {
        db.select.mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([{ id: "session-1" }]),
            }),
          }),
        } as any);

        const result = await service.listSessions("user-1");
        expect(result).toEqual([{ id: "session-1" }]);
      });

      it("revokes all sessions", async () => {
        await service.revokeAllSessions("user-1");
        expect(db.update).toHaveBeenCalled();
        expect(db.insert).toHaveBeenCalled(); // audit log
      });

      it("logs out by session", async () => {
        await service.logoutBySession("session-1", "user-1");
        expect(db.update).toHaveBeenCalled();
        expect(db.insert).toHaveBeenCalled(); // security event
      });

      it("revokes by token", async () => {
        await service.revokeByToken("some-token");
        expect(db.update).toHaveBeenCalled();
      });
    });
  });
});
