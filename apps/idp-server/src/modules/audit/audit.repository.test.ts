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
    it("stores non-admin audit logs without hash-chain metadata", async () => {
      await repository.createAuditLog({
        actorUserId: "u1",
        action: "login",
        resourceType: "auth",
        payload: { foo: "bar" },
      });
      expect(db.insert).toHaveBeenCalled();
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          entryHash: null,
          prevHash: null,
          integrityVersion: 0,
        }),
      );
    });

    it("stores admin audit logs with hash-chain metadata", async () => {
      await repository.createAuditLog({
        actorUserId: "u1",
        action: "admin.config.updated",
        resourceType: "config",
        payload: { foo: "bar" },
      });
      expect(db.insert).toHaveBeenCalled();
      expect(db.values).toHaveBeenCalledWith(
        expect.objectContaining({
          entryHash: expect.any(String),
          integrityVersion: 1,
        }),
      );
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

  describe("verifyIntegrityRange", () => {
    it("returns ok when no v1 rows exist", async () => {
      const result = await repository.verifyIntegrityRange({});
      expect(result.ok).toBe(true);
      expect(result.checked).toBe(0);
    });
  });
});
