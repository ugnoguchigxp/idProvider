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

    it("should consume email token", async () => {
      await repository.consumeEmailToken("v1");
      expect(db.update).toHaveBeenCalled();
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

    it("should consume password token", async () => {
      await repository.consumePasswordToken("p1");
      expect(db.update).toHaveBeenCalled();
    });
  });
});
