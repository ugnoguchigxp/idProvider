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

  describe("create", () => {
    it("should create user, email, and password", async () => {
      db.returning.mockImplementationOnce(() => [
        { id: "u1", status: "active", createdAt: new Date() },
      ]);

      const result = await repository.create({
        email: "a@b.com",
        passwordHash: "hash",
      });

      expect(result.id).toBe("u1");
      expect(db.insert).toHaveBeenCalledTimes(3); // users, userEmails, userPasswords
    });

    it("should create profile if displayName is provided", async () => {
      db.returning.mockImplementationOnce(() => [
        { id: "u1", status: "active", createdAt: new Date() },
      ]);

      const result = await repository.create({
        email: "a@b.com",
        passwordHash: "hash",
        displayName: "John",
      });

      expect(result.id).toBe("u1");
      expect(db.insert).toHaveBeenCalledTimes(4); // users, userEmails, userPasswords, userProfiles
    });

    it("should throw if user creation fails", async () => {
      db.returning.mockImplementationOnce(() => []);

      await expect(
        repository.create({
          email: "a@b.com",
          passwordHash: "hash",
        }),
      ).rejects.toThrow("Failed to create user");
    });
  });

  describe("createWithoutPassword", () => {
    it("should create user and email", async () => {
      db.returning.mockImplementationOnce(() => [
        { id: "u1", status: "active", createdAt: new Date() },
      ]);

      const result = await repository.createWithoutPassword({
        email: "a@b.com",
      });

      expect(result.id).toBe("u1");
      expect(db.insert).toHaveBeenCalledTimes(2); // users, userEmails
    });

    it("should create user and set emailVerified", async () => {
      db.returning.mockImplementationOnce(() => [
        { id: "u1", status: "active", createdAt: new Date() },
      ]);

      const result = await repository.createWithoutPassword({
        email: "a@b.com",
        emailVerified: true,
      });

      expect(result.id).toBe("u1");
      expect(db.insert).toHaveBeenCalledTimes(2);
    });

    it("should throw if user creation fails", async () => {
      db.returning.mockImplementationOnce(() => []);

      await expect(
        repository.createWithoutPassword({
          email: "a@b.com",
        }),
      ).rejects.toThrow("Failed to create user");
    });
  });
});
