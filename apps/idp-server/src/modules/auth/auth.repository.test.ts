import { beforeEach, describe, expect, it } from "vitest";
import { createDrizzleMock } from "../../test-utils/drizzle-mock.js";
import { AuthRepository } from "./auth.repository.js";

describe("AuthRepository", () => {
  let repository: AuthRepository;
  let db: any;

  beforeEach(() => {
    db = createDrizzleMock();
    repository = new AuthRepository(db);
  });

  describe("recordAttempt", () => {
    it("should call db insert correctly", async () => {
      await repository.recordAttempt("test@example.com", true, "127.0.0.1");
      expect(db.insert).toHaveBeenCalled();
      expect(db.values).toHaveBeenCalled();
    });
  });
});
