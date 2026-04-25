import { ApiError } from "@idp/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserService } from "./users.service.js";

describe("UserService", () => {
  let userService: UserService;
  let deps: any;

  beforeEach(() => {
    deps = {
      userRepository: {
        findById: vi.fn(),
        update: vi.fn(),
        findWithPasswordById: vi.fn(),
      },
      identityRepository: {
        delete: vi.fn(),
      },
      auditRepository: {
        create: vi.fn(),
      },
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
    };
    userService = new UserService(deps);
  });

  describe("getMe", () => {
    it("should return user info if found", async () => {
      const mockUser = {
        id: "u1",
        email: "test@example.com",
        status: "active",
      };
      deps.userRepository.findById.mockResolvedValue(mockUser);
      const result = await userService.getMe("u1");
      expect(result.ok).toBe(true);
    });
  });

  describe("changePassword", () => {
    it("should successfully change password", async () => {
      deps.userRepository.findWithPasswordById.mockResolvedValue({
        id: "u1",
        passwordHash: "old",
      });
      const result = await userService.changePassword("u1", "old", "new");
      expect(result.ok).toBe(true);
    });
  });

  describe("linkGoogleIdentity", () => {
    it("should return ok", async () => {
      const result = await userService.linkGoogleIdentity({
        userId: "u1",
        idToken: "itok",
        clientId: "cid",
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("unlinkSocialIdentity", () => {
    it("should successfully unlink identity", async () => {
      const result = await userService.unlinkSocialIdentity(
        "u1",
        "google",
        "sub-1",
      );
      expect(result.ok).toBe(true);
    });
  });

  describe("verifyCurrentPassword", () => {
    it("should pass if password matches", async () => {
      deps.userRepository.findWithPasswordById.mockResolvedValue({
        id: "u1",
        passwordHash: "pass",
      });
      await expect(
        userService.verifyCurrentPassword("u1", "pass"),
      ).resolves.not.toThrow();
    });

    it("should throw if password mismatch", async () => {
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
