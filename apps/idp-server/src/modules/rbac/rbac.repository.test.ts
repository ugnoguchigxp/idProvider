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
