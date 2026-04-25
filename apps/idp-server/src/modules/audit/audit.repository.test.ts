import { beforeEach, describe, expect, it } from "vitest";
import { createDrizzleMock } from "../../test-utils/drizzle-mock.js";
import { AuditRepository } from "./audit.repository.js";

describe("AuditRepository", () => {
  let repository: AuditRepository;
  let db: any;

  beforeEach(() => {
    db = createDrizzleMock();
    repository = new AuditRepository(db);
  });

  describe("createAuditLog", () => {
    it("should insert an audit log", async () => {
      await repository.createAuditLog({
        actorUserId: "u1",
        action: "login",
        resourceType: "auth",
        payload: { foo: "bar" },
      });
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe("createSecurityEvent", () => {
    it("should insert a security event", async () => {
      await repository.createSecurityEvent({
        eventType: "mfa_failed",
        userId: "u1",
        payload: { reason: "wrong_code" },
      });
      expect(db.insert).toHaveBeenCalled();
    });
  });
});
