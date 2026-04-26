import { beforeEach, describe, expect, it } from "vitest";
import { createDrizzleMock } from "../../test-utils/drizzle-mock.js";
import { VerificationRepository } from "./verification.repository.js";

describe("VerificationRepository", () => {
  let repository: VerificationRepository;
  let db: any;

  beforeEach(() => {
    db = createDrizzleMock();
    repository = new VerificationRepository(db);
  });

  describe("Email Tokens", () => {
    it("should find valid email token", async () => {
      db.then.mockImplementation((resolve: any) => resolve([{ id: "v1" }]));
      const result = await repository.findEmailToken("hash");
      expect(result?.id).toBe("v1");
    });

    it("should create email token", async () => {
      await repository.createEmailToken({
        userId: "u1",
        tokenHash: "h",
        expiresAt: new Date(),
      });
      expect(db.insert).toHaveBeenCalled();
    });

    it("should consume email token and return boolean", async () => {
      db.returning.mockImplementationOnce(() => [{ id: "v1" }]);
      const result1 = await repository.consumeEmailToken("v1");
      expect(db.update).toHaveBeenCalled();
      expect(result1).toBe(true);

      db.returning.mockImplementationOnce(() => []);
      const result2 = await repository.consumeEmailToken("v2");
      expect(result2).toBe(false);
    });

    it("should consume valid email token by hash", async () => {
      db.returning.mockImplementationOnce(() => [{ id: "v1", userId: "u1" }]);
      const result1 = await repository.consumeValidEmailTokenByHash("hash1");
      expect(result1).toEqual({ id: "v1", userId: "u1" });

      db.returning.mockImplementationOnce(() => []);
      const result2 = await repository.consumeValidEmailTokenByHash("hash2");
      expect(result2).toBeNull();
    });
  });

  describe("Password Tokens", () => {
    it("should find valid password token", async () => {
      db.then.mockImplementation((resolve: any) => resolve([{ id: "p1" }]));
      const result = await repository.findPasswordResetToken("hash");
      expect(result?.id).toBe("p1");
    });

    it("should create password token", async () => {
      await repository.createPasswordToken({
        userId: "u1",
        tokenHash: "h",
        expiresAt: new Date(),
      });
      expect(db.insert).toHaveBeenCalled();
    });

    it("should consume password token and return boolean", async () => {
      db.returning.mockImplementationOnce(() => [{ id: "p1" }]);
      const result1 = await repository.consumePasswordToken("p1");
      expect(db.update).toHaveBeenCalled();
      expect(result1).toBe(true);

      db.returning.mockImplementationOnce(() => []);
      const result2 = await repository.consumePasswordToken("p2");
      expect(result2).toBe(false);
    });

    it("should consume valid password token by hash", async () => {
      db.returning.mockImplementationOnce(() => [{ id: "p1", userId: "u1" }]);
      const result1 = await repository.consumeValidPasswordTokenByHash("hash1");
      expect(result1).toEqual({ id: "p1", userId: "u1" });

      db.returning.mockImplementationOnce(() => []);
      const result2 = await repository.consumeValidPasswordTokenByHash("hash2");
      expect(result2).toBeNull();
    });
  });
});
