import { beforeEach, describe, expect, it, vi } from "vitest";
import { RBACService } from "./rbac.service.js";

describe("RBACService", () => {
  let service: RBACService;
  let repository: any;

  beforeEach(() => {
    repository = {
      listPermissionKeys: vi.fn(),
      findEntitlement: vi.fn(),
      listAllActiveEntitlementKeys: vi.fn().mockResolvedValue([]),
    };
    service = new RBACService(repository);
  });

  describe("getAuthorizationSnapshot", () => {
    it("should return snapshot with permissions", async () => {
      repository.listPermissionKeys.mockResolvedValue(["user:read"]);
      repository.listAllActiveEntitlementKeys.mockResolvedValue(["k1"]);
      repository.findEntitlement.mockResolvedValue({
        key: "k1",
        value: true,
        scope: "user",
      });

      const result = await service.getAuthorizationSnapshot("u1");
      expect(result.permissions).toContain("user:read");
      expect(result.entitlements.k1).toBe(true);
    });
  });

  describe("authorizationCheck", () => {
    it("should allow if permission exists", async () => {
      repository.listPermissionKeys.mockResolvedValue(["user:read"]);
      const result = await service.authorizationCheck({
        userId: "u1",
        action: "read",
        resource: "user",
      });
      expect(result.allowed).toBe(true);
      expect(result.permissionKey).toBe("user:read");
    });

    it("should allow resource all wildcard permissions", async () => {
      repository.listPermissionKeys.mockResolvedValue(["admin:all"]);
      const result = await service.authorizationCheck({
        userId: "u1",
        action: "manage",
        resource: "admin",
      });
      expect(result.allowed).toBe(true);
      expect(result.permissionKey).toBe("admin:manage");
    });

    it("should deny if permission missing", async () => {
      repository.listPermissionKeys.mockResolvedValue([]);
      const result = await service.authorizationCheck({
        userId: "u1",
        action: "read",
        resource: "user",
      });
      expect(result.allowed).toBe(false);
    });
  });

  describe("entitlementCheck", () => {
    it("should allow if entitlement exists", async () => {
      repository.findEntitlement.mockResolvedValue({
        key: "k1",
        value: true,
        scope: "user",
      });
      const result = await service.entitlementCheck({
        userId: "u1",
        key: "k1",
      });
      expect(result.allowed).toBe(true);
    });

    it("should deny if entitlement missing", async () => {
      repository.findEntitlement.mockResolvedValue(null);
      const result = await service.entitlementCheck({
        userId: "u1",
        key: "k1",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("not_entitled");
    });
  });
});
