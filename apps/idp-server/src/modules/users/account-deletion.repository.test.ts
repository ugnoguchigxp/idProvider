import { beforeEach, describe, expect, it } from "vitest";
import { createDrizzleMock } from "../../test-utils/drizzle-mock.js";
import { AccountDeletionRepository } from "./account-deletion.repository.js";

describe("AccountDeletionRepository", () => {
  let repository: AccountDeletionRepository;
  let db: any;

  beforeEach(() => {
    db = createDrizzleMock();
    repository = new AccountDeletionRepository(db);
  });

  describe("markAsDeleted", () => {
    it("should return null if user is not found or not active", async () => {
      db.returning.mockImplementationOnce(() => []);

      const result = await repository.markAsDeleted("u1", {
        deletedAt: new Date(),
        deletionRequestedAt: new Date(),
        deletionDueAt: new Date(),
      });

      expect(result).toBeNull();
      expect(db.update).toHaveBeenCalledTimes(1); // Only user update, no session update
    });

    it("should return updated due date and revoke sessions if successful", async () => {
      const now = new Date();
      db.returning.mockImplementationOnce(() => [{ deletionDueAt: now }]);

      const result = await repository.markAsDeleted("u1", {
        deletedAt: now,
        deletionRequestedAt: now,
        deletionDueAt: now,
      });

      expect(result).toEqual({ deletionDueAt: now });
      expect(db.update).toHaveBeenCalledTimes(2); // user update + session update
    });
  });

  describe("findDeletionScheduleByUserId", () => {
    it("should return deletionDueAt if user is found", async () => {
      const now = new Date();
      db.then.mockImplementationOnce((resolve: any) =>
        resolve([{ deletionDueAt: now }]),
      );

      const result = await repository.findDeletionScheduleByUserId("u1");
      expect(result).toEqual({ deletionDueAt: now });
    });

    it("should return null if user is not found", async () => {
      db.then.mockImplementationOnce((resolve: any) => resolve([]));

      const result = await repository.findDeletionScheduleByUserId("u1");
      expect(result).toBeNull();
    });
  });

  describe("findDueDeletions", () => {
    it("should return user ids", async () => {
      db.then.mockImplementationOnce((resolve: any) =>
        resolve([{ id: "u1" }, { id: "u2" }]),
      );

      const result = await repository.findDueDeletions(new Date(), 10);
      expect(result).toEqual([{ id: "u1" }, { id: "u2" }]);
    });
  });

  describe("hasActiveLegalHold", () => {
    it("should return true if active hold is found", async () => {
      db.then.mockImplementationOnce((resolve: any) =>
        resolve([{ id: "lh1" }]),
      );

      const result = await repository.hasActiveLegalHold("u1");
      expect(result).toBe(true);
    });

    it("should return false if no active hold is found", async () => {
      db.then.mockImplementationOnce((resolve: any) => resolve([]));

      const result = await repository.hasActiveLegalHold("u1");
      expect(result).toBe(false);
    });
  });

  describe("physicallyDeleteUser", () => {
    it("should call delete", async () => {
      await repository.physicallyDeleteUser("u1");
      expect(db.delete).toHaveBeenCalledTimes(1);
    });
  });
});
