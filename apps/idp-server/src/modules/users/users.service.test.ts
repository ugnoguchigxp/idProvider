import { ApiError } from "@idp/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserService } from "./users.service.js";

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
        delete: vi.fn(),
      },
      auditRepository: {
        createAuditLog: vi.fn(),
      },
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
    };
    userService = new UserService(deps);
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
      deps.userRepository.findWithPasswordById.mockResolvedValue({
        id: "u1",
        passwordHash: "old",
      });
      const result = await userService.changePassword("u1", "old", "new");
      expect(result.ok).toBe(true);
    });
  });

  describe("linkGoogleIdentity", () => {
    it("returns ok", async () => {
      const result = await userService.linkGoogleIdentity({
        userId: "u1",
        idToken: "itok",
        clientId: "cid",
      });
      expect(result.ok).toBe(true);
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
    });
  });

  describe("verifyCurrentPassword", () => {
    it("passes if password matches", async () => {
      deps.userRepository.findWithPasswordById.mockResolvedValue({
        id: "u1",
        passwordHash: "pass",
      });
      await expect(
        userService.verifyCurrentPassword("u1", "pass"),
      ).resolves.not.toThrow();
    });

    it("throws if password mismatch", async () => {
      deps.userRepository.findWithPasswordById.mockResolvedValue({
        id: "u1",
        passwordHash: "pass",
      });
      await expect(
        userService.verifyCurrentPassword("u1", "wrong"),
      ).rejects.toThrow(ApiError);
    });
  });
});
