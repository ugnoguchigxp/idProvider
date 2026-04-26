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
      db.then.mockImplementationOnce((resolve: any) => resolve([]));
      const result = await repository.verifyIntegrityRange({});
      expect(result.ok).toBe(true);
      expect(result.checked).toBe(0);
    });

    it("returns ok when integrity is verified", async () => {
      const createdAt = new Date();
      // To pass verify, we need a valid hash. We can mock buildEntryHash or just create a valid entry hash.
      // Since it's private, we can spy on it or just construct the data so it matches.
      const row1 = {
        id: "1",
        createdAt,
        actorUserId: "u1",
        action: "action",
        resourceType: "type",
        resourceId: "r1",
        payload: { a: 1 },
        prevHash: "prev",
        entryHash: "",
      };
      // Build actual expected hash
      const rep = repository as any;
      row1.entryHash = rep.buildEntryHash(row1);

      db.then
        .mockImplementationOnce((resolve: any) => resolve([row1])) // first query for rows
        .mockImplementationOnce((resolve: any) =>
          resolve([{ entryHash: "prev" }]),
        ); // previous row query

      const result = await repository.verifyIntegrityRange({});
      expect(result.ok).toBe(true);
      expect(result.checked).toBe(1);
    });

    it("returns false on prevHash mismatch", async () => {
      const row1 = {
        id: "1",
        createdAt: new Date(),
        actorUserId: "u1",
        action: "action",
        resourceType: "type",
        resourceId: "r1",
        payload: { a: 1 },
        prevHash: "mismatch",
        entryHash: "hash1",
      };

      db.then
        .mockImplementationOnce((resolve: any) => resolve([row1]))
        .mockImplementationOnce((resolve: any) =>
          resolve([{ entryHash: "prev" }]),
        );

      const result = await repository.verifyIntegrityRange({});
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("prev_hash_mismatch");
    });

    it("returns false on entryHash mismatch", async () => {
      const row1 = {
        id: "1",
        createdAt: new Date(),
        actorUserId: "u1",
        action: "action",
        resourceType: "type",
        resourceId: "r1",
        payload: { a: 1 },
        prevHash: "prev",
        entryHash: "invalid_hash",
      };

      db.then
        .mockImplementationOnce((resolve: any) => resolve([row1]))
        .mockImplementationOnce((resolve: any) =>
          resolve([{ entryHash: "prev" }]),
        );

      const result = await repository.verifyIntegrityRange({});
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("entry_hash_mismatch");
    });
  });

  describe("listAuditLogs", () => {
    it("returns items and nextCursor", async () => {
      const rows = [
        { id: "2", createdAt: new Date() },
        { id: "1", createdAt: new Date() },
      ];
      // When 1 item requested, DB limit is 2. Mock returns 2 to simulate hasNext.
      db.then.mockImplementationOnce((resolve: any) => resolve(rows));

      const result = await repository.listAuditLogs({
        limit: 1,
        from: new Date(),
        to: new Date(),
        actorUserId: "u1",
        action: "a",
        resourceType: "r",
        resourceId: "r1",
        cursor: { id: "3", createdAt: new Date() },
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0]?.id).toBe("2");
      expect(result.nextCursor).toEqual({
        id: "2",
        createdAt: expect.any(Date),
      });
    });
  });

  describe("listSecurityEvents", () => {
    it("returns items and nextCursor", async () => {
      const rows = [
        { id: "2", createdAt: new Date() },
        { id: "1", createdAt: new Date() },
      ];
      db.then.mockImplementationOnce((resolve: any) => resolve(rows));

      const result = await repository.listSecurityEvents({
        limit: 1,
        from: new Date(),
        to: new Date(),
        userId: "u1",
        eventType: "e",
        cursor: { id: "3", createdAt: new Date() },
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0]?.id).toBe("2");
      expect(result.nextCursor).toEqual({
        id: "2",
        createdAt: expect.any(Date),
      });
    });
  });
});
