import { beforeEach, describe, expect, it } from "vitest";
import { createDrizzleMock } from "../../test-utils/drizzle-mock.js";
import { MfaRepository } from "./mfa.repository.js";

describe("MfaRepository", () => {
  let repository: MfaRepository;
  let db: any;

  beforeEach(() => {
    db = createDrizzleMock();
    repository = new MfaRepository(db);
  });

  describe("create", () => {
    it("should insert a new mfa factor", async () => {
      await repository.create({
        userId: "u1",
        factorId: "f1",
        type: "totp",
        secret: "sec",
      });
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe("findByFactorId", () => {
    it("should return factor if found", async () => {
      const mockFactor = { id: "f1", userId: "u1", type: "totp" };
      db.then.mockImplementation((resolve: any) => resolve([mockFactor]));

      const result = await repository.findByFactorId("f1");
      expect(result?.id).toBe("f1");
    });
  });
});
