import { beforeEach, describe, expect, it } from "vitest";
import { createDrizzleMock } from "../../test-utils/drizzle-mock.js";
import { UserRepository } from "./user.repository.js";

describe("UserRepository", () => {
  let repository: UserRepository;
  let db: any;

  beforeEach(() => {
    db = createDrizzleMock();
    repository = new UserRepository(db);
  });

  describe("findById", () => {
    it("should return user if found", async () => {
      db.then.mockImplementation((resolve: any) =>
        resolve([{ id: "u1", email: "a@b.com" }]),
      );
      const result = await repository.findById("u1");
      expect(result?.id).toBe("u1");
    });
  });

  describe("findWithPasswordById", () => {
    it("should return user with password", async () => {
      db.then.mockImplementation((resolve: any) =>
        resolve([{ id: "u1", passwordHash: "h" }]),
      );
      const result = await repository.findWithPasswordById("u1");
      expect(result?.passwordHash).toBe("h");
    });
  });

  describe("findByEmail", () => {
    it("should return user by email", async () => {
      db.then.mockImplementation((resolve: any) =>
        resolve([{ id: "u1", email: "a@b.com" }]),
      );
      const result = await repository.findByEmail("a@b.com");
      expect(result?.id).toBe("u1");
    });
  });

  describe("findWithPasswordByEmail", () => {
    it("should return user with password", async () => {
      db.then.mockImplementation((resolve: any) =>
        resolve([{ id: "u1", passwordHash: "h" }]),
      );
      const result = await repository.findWithPasswordByEmail("a@b.com");
      expect(result?.passwordHash).toBe("h");
    });
  });

  describe("update", () => {
    it("should update email verification", async () => {
      await repository.update("u1", { emailVerified: true });
      expect(db.update).toHaveBeenCalled();
    });

    it("should update password hash", async () => {
      await repository.update("u1", { passwordHash: "newh" });
      expect(db.update).toHaveBeenCalled();
    });
  });
});
