import { ApiError } from "@idp/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "../../core/password.js";
import { UserService } from "./users.service.js";

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    verifyIdToken: vi.fn().mockResolvedValue({
      getPayload: () => ({
        sub: "google-sub-1",
        email: "test@example.com",
        email_verified: true,
      }),
    }),
  })),
}));

describe("UserService", () => {
  let userService: UserService;
  let deps: any;

  beforeEach(() => {
    deps = {
      db: {
        transaction: vi.fn(async (handler: any) => handler({})),
      },
      userRepository: {
        findById: vi.fn(),
        findByEmail: vi.fn(),
        update: vi.fn(),
        findWithPasswordById: vi.fn(),
      },
      userProfileRepository: {
        upsert: vi.fn(),
        isPreferredUsernameTaken: vi.fn().mockResolvedValue(false),
      },
      profileCache: {
        invalidate: vi.fn().mockResolvedValue(undefined),
      },
      identityRepository: {
        findByProvider: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
      auditRepository: {
        createAuditLog: vi.fn(),
        createSecurityEvent: vi.fn(),
      },
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
    };
    userService = new UserService(deps);
  });

  describe("findActiveUserIdByEmail", () => {
    it("should return userId if active", async () => {
      deps.userRepository.findByEmail.mockResolvedValue({
        id: "u1",
        status: "active",
      });
      const result = await userService.findActiveUserIdByEmail("a@b.com");
      expect(result).toBe("u1");
    });

    it("should return null if not found or inactive", async () => {
      deps.userRepository.findByEmail.mockResolvedValue({
        id: "u1",
        status: "suspended",
      });
      expect(await userService.findActiveUserIdByEmail("a@b.com")).toBeNull();

      deps.userRepository.findByEmail.mockResolvedValue(null);
      expect(await userService.findActiveUserIdByEmail("a@b.com")).toBeNull();
    });
  });

  describe("getMe", () => {
    it("returns mapped me response", async () => {
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        email: "test@example.com",
        status: "active",
        emailVerified: true,
        profile: {
          displayName: "Taro Yamada",
          givenName: "Taro",
          familyName: "Yamada",
          preferredUsername: "taro",
          locale: "ja-JP",
          zoneinfo: "Asia/Tokyo",
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });

      const result = await userService.getMe("u1");
      expect(result.ok).toBe(true);
      if (!result.ok) throw result.error;
      expect(result.value.userId).toBe("u1");
      expect(result.value.emailVerified).toBe(true);
      expect(result.value.profile.displayName).toBe("Taro Yamada");
    });

    it("rejects if user not found", async () => {
      deps.userRepository.findById.mockResolvedValue(null);
      await expect(userService.getMe("u1")).rejects.toMatchObject({
        status: 404,
        code: "user_not_found",
      });
    });

    it("rejects inactive users", async () => {
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        email: "test@example.com",
        status: "deleted",
        profile: {},
      });

      await expect(userService.getMe("u1")).rejects.toMatchObject({
        status: 401,
        code: "unauthorized",
      });
    });
  });

  describe("getOidcAccount", () => {
    it("returns mapped OIDC account response", async () => {
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        email: "test@example.com",
        status: "active",
        emailVerified: true,
        profile: {
          displayName: "Taro Yamada",
          givenName: "Taro",
          familyName: "Yamada",
          preferredUsername: "taro",
          locale: "ja-JP",
          zoneinfo: "Asia/Tokyo",
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      });

      const result = await userService.getOidcAccount("u1");
      expect(result.userId).toBe("u1");
      expect(result.emailVerified).toBe(true);
      expect(result.profile.displayName).toBe("Taro Yamada");
    });
  });

  describe("updateProfile", () => {
    it("updates profile and writes audit + cache invalidation", async () => {
      deps.userRepository.findById
        .mockResolvedValueOnce({
          id: "u1",
          status: "active",
          email: "test@example.com",
          emailVerified: true,
          profile: {},
        })
        .mockResolvedValueOnce({
          id: "u1",
          status: "active",
          email: "test@example.com",
          emailVerified: true,
          profile: {
            displayName: "Taro Yamada",
            givenName: null,
            familyName: null,
            preferredUsername: "taro",
            locale: "ja-JP",
            zoneinfo: null,
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        });

      const result = await userService.updateProfile("u1", {
        displayName: "Taro Yamada",
        preferredUsername: "taro",
        locale: "ja-JP",
      });

      expect(result.ok).toBe(true);
      expect(deps.userProfileRepository.upsert).toHaveBeenCalledWith(
        "u1",
        {
          displayName: "Taro Yamada",
          preferredUsername: "taro",
          locale: "ja-JP",
        },
        {},
      );
      expect(deps.auditRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "user.profile.updated",
          payload: {
            changedFields: ["displayName", "preferredUsername", "locale"],
          },
        }),
        {},
      );
      expect(deps.profileCache.invalidate).toHaveBeenCalledWith("u1");
    });

    it("returns 409 when preferred username is taken", async () => {
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        status: "active",
        email: "test@example.com",
        profile: {},
      });
      deps.userProfileRepository.isPreferredUsernameTaken.mockResolvedValue(
        true,
      );

      await expect(
        userService.updateProfile("u1", { preferredUsername: "taken" }),
      ).rejects.toMatchObject({
        status: 409,
        code: "preferred_username_taken",
      });
      expect(deps.profileCache.invalidate).not.toHaveBeenCalled();
    });

    it("maps unique violation to 409", async () => {
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        status: "active",
        email: "test@example.com",
        profile: {},
      });
      deps.userProfileRepository.upsert.mockRejectedValue({ code: "23505" });

      await expect(
        userService.updateProfile("u1", { preferredUsername: "taken" }),
      ).rejects.toMatchObject({
        status: 409,
        code: "preferred_username_taken",
      });
      expect(deps.profileCache.invalidate).not.toHaveBeenCalled();
    });

    it("rejects non-active users", async () => {
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        status: "suspended",
        email: "test@example.com",
        profile: {},
      });

      await expect(
        userService.updateProfile("u1", { displayName: "Taro" }),
      ).rejects.toMatchObject({
        status: 401,
        code: "unauthorized",
      });
    });
  });

  describe("changePassword", () => {
    it("successfully changes password", async () => {
      const oldHash = await hashPassword("old");
      deps.userRepository.findWithPasswordById.mockResolvedValue({
        id: "u1",
        passwordHash: oldHash,
      });
      const result = await userService.changePassword("u1", "old", "new");
      expect(result.ok).toBe(true);
    });
  });

  describe("linkGoogleIdentity", () => {
    it("returns ok", async () => {
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        email: "test@example.com",
        status: "active",
        profile: {},
      });
      deps.identityRepository.findByProvider.mockResolvedValue(null);

      const result = await userService.linkGoogleIdentity({
        userId: "u1",
        idToken: "itok",
        clientId: "cid",
      });
      expect(result.ok).toBe(true);
      expect(deps.identityRepository.create).toHaveBeenCalledWith({
        userId: "u1",
        provider: "google",
        providerSubject: "google-sub-1",
        email: "test@example.com",
      });
      expect(deps.auditRepository.createSecurityEvent).toHaveBeenCalledWith({
        eventType: "identity.google.linked",
        userId: "u1",
        payload: {
          providerSubject: "google-sub-1",
          email: "test@example.com",
        },
      });
    });

    it("throws if token is invalid", async () => {
      const OAuth2ClientMock = (await import("google-auth-library"))
        .OAuth2Client as any;
      OAuth2ClientMock.mockImplementationOnce(() => ({
        verifyIdToken: vi.fn().mockRejectedValue(new Error("invalid")),
      }));

      await expect(
        userService.linkGoogleIdentity({
          userId: "u1",
          idToken: "bad",
          clientId: "cid",
        }),
      ).rejects.toMatchObject({ code: "invalid_google_token" });
    });

    it("throws if token payload is missing email", async () => {
      const OAuth2ClientMock = (await import("google-auth-library"))
        .OAuth2Client as any;
      OAuth2ClientMock.mockImplementationOnce(() => ({
        verifyIdToken: vi.fn().mockResolvedValue({
          getPayload: () => ({ sub: "sub1" }), // Missing email
        }),
      }));

      await expect(
        userService.linkGoogleIdentity({
          userId: "u1",
          idToken: "bad",
          clientId: "cid",
        }),
      ).rejects.toMatchObject({ code: "invalid_google_token" });
    });

    it("throws if email mismatches user's primary email", async () => {
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        email: "other@example.com",
        status: "active",
        profile: {},
      });

      await expect(
        userService.linkGoogleIdentity({
          userId: "u1",
          idToken: "tok",
          clientId: "cid",
        }),
      ).rejects.toMatchObject({ code: "email_mismatch" });
    });

    it("throws if identity is already linked to another user", async () => {
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        email: "test@example.com",
        status: "active",
        profile: {},
      });
      deps.identityRepository.findByProvider.mockResolvedValue({
        userId: "u2",
      });

      await expect(
        userService.linkGoogleIdentity({
          userId: "u1",
          idToken: "tok",
          clientId: "cid",
        }),
      ).rejects.toMatchObject({ code: "google_identity_in_use" });
    });

    it("does not create identity if it is already linked to the same user", async () => {
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        email: "test@example.com",
        status: "active",
        profile: {},
      });
      deps.identityRepository.findByProvider.mockResolvedValue({
        userId: "u1",
      });

      const result = await userService.linkGoogleIdentity({
        userId: "u1",
        idToken: "tok",
        clientId: "cid",
      });

      expect(result.ok).toBe(true);
      expect(deps.identityRepository.create).not.toHaveBeenCalled();
    });
  });

  describe("unlinkSocialIdentity", () => {
    it("successfully unlinks identity", async () => {
      const result = await userService.unlinkSocialIdentity(
        "u1",
        "google",
        "sub-1",
      );
      expect(result.ok).toBe(true);
      expect(deps.auditRepository.createSecurityEvent).toHaveBeenCalledWith({
        eventType: "identity.google.unlinked",
        userId: "u1",
        payload: {
          providerSubject: "sub-1",
        },
      });
    });
  });

  describe("verifyCurrentPassword", () => {
    it("passes if password matches", async () => {
      const passwordHash = await hashPassword("pass");
      deps.userRepository.findWithPasswordById.mockResolvedValue({
        id: "u1",
        passwordHash,
      });
      await expect(
        userService.verifyCurrentPassword("u1", "pass"),
      ).resolves.not.toThrow();
    });

    it("throws if password mismatch", async () => {
      const passwordHash = await hashPassword("pass");
      deps.userRepository.findWithPasswordById.mockResolvedValue({
        id: "u1",
        passwordHash,
      });
      await expect(
        userService.verifyCurrentPassword("u1", "wrong"),
      ).rejects.toThrow(ApiError);
    });
  });
});
