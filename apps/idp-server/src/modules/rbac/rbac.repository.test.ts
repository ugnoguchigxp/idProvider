import { beforeEach, describe, expect, it } from "vitest";
import { createDrizzleMock } from "../../test-utils/drizzle-mock.js";
import { RBACRepository } from "./rbac.repository.js";

describe("RBACRepository", () => {
  let repository: RBACRepository;
  let db: any;

  beforeEach(() => {
    db = createDrizzleMock();
    repository = new RBACRepository(db);
  });

  describe("listPermissionKeys", () => {
    it("should return unique permission keys", async () => {
      db.then.mockImplementation((resolve: any) =>
        resolve([{ key: "read" }, { key: "write" }]),
      );
      const result = await repository.listPermissionKeys("u1");
      expect(result).toEqual(["read", "write"]);
    });

    it("should filter with context parameters", async () => {
      db.then.mockImplementation((resolve: any) => resolve([{ key: "read" }]));
      const result = await repository.listPermissionKeys("u1", {
        groupId: "g1",
        organizationId: "o1",
      });
      expect(result).toEqual(["read"]);
    });
  });

  describe("findEntitlement", () => {
    it("should return user-level entitlement", async () => {
      db.then.mockImplementation((resolve: any) =>
        resolve([{ id: "e1", key: "k1", userId: "u1" }]),
      );
      const result = await repository.findEntitlement({
        userId: "u1",
        key: "k1",
      });
      expect(result?.scope).toBe("user");
    });

    it("should return group-level entitlement if user-level missing", async () => {
      let callCount = 0;
      db.then.mockImplementation((resolve: any) => {
        callCount++;
        if (callCount === 1) return resolve([]);
        return resolve([{ entitlements: { id: "e2", key: "k1" } }]);
      });

      const result = await repository.findEntitlement({
        userId: "u1",
        key: "k1",
      });
      expect(result?.scope).toBe("group");
    });

    it("should return organization-level entitlement if group-level missing", async () => {
      let callCount = 0;
      db.then.mockImplementation((resolve: any) => {
        callCount++;
        if (callCount === 1) return resolve([]); // user
        if (callCount === 2) return resolve([]); // group
        if (callCount === 3) return resolve([{ organizationId: "org1" }]); // membership check
        if (callCount === 4)
          return resolve([{ id: "e3", key: "k1", organizationId: "org1" }]); // organization
        return resolve([]);
      });

      const result = await repository.findEntitlement({
        userId: "u1",
        key: "k1",
        organizationId: "org1",
      });
      expect(result?.scope).toBe("organization");
    });

    it("should return null if organization entitlement check fails membership check", async () => {
      let callCount = 0;
      db.then.mockImplementation((resolve: any) => {
        callCount++;
        if (callCount <= 2) return resolve([]);
        return resolve([]); // membership check returns empty
      });

      const result = await repository.findEntitlement({
        userId: "u1",
        key: "k1",
        organizationId: "org1",
      });
      expect(result).toBeNull();
    });

    it("should return null if no entitlement found", async () => {
      db.then.mockImplementation((resolve: any) => resolve([]));
      const result = await repository.findEntitlement({
        userId: "u1",
        key: "k1",
      });
      expect(result).toBeNull();
    });
  });

  describe("listAllActiveEntitlementKeys", () => {
    it("should return unique keys", async () => {
      db.then.mockImplementation((resolve: any) =>
        resolve([{ key: "k1" }, { key: "k2" }]),
      );
      const result = await repository.listAllActiveEntitlementKeys();
      expect(result).toEqual(["k1", "k2"]);
    });
  });
});
