import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createDrizzleMock } from "../../test-utils/drizzle-mock.js";
import { SessionRepository } from "./session.repository.js";

describe("SessionRepository", () => {
  let repository: SessionRepository;
  let db: any;

  beforeEach(() => {
    db = createDrizzleMock();
    repository = new SessionRepository(db);
  });

  describe("create", () => {
    it("should insert a new session", async () => {
      const sessionId = randomUUID();
      db.then.mockImplementation((resolve: any) =>
        resolve([{ id: sessionId }]),
      );

      const result = await repository.create({
        userId: "u1",
        accessTokenHash: "at",
        refreshTokenHash: "rt",
        expiresAt: new Date(),
        refreshExpiresAt: new Date(),
        ipAddress: "127.0.0.1",
        userAgent: "UA",
      });

      expect(db.insert).toHaveBeenCalled();
      expect(result?.id).toBe(sessionId);
    });
  });

  describe("updateLastSeen", () => {
    it("should update lastSeenAt", async () => {
      await repository.updateLastSeen("s1");
      expect(db.update).toHaveBeenCalled();
    });
  });

  describe("revoke", () => {
    it("should set revokedAt", async () => {
      await repository.revoke("s1");
      expect(db.update).toHaveBeenCalled();
    });
  });

  describe("findAllByUserId", () => {
    it("should return sessions for user", async () => {
      db.then.mockImplementation((resolve: any) => resolve([{ id: "s1" }]));
      const result = await repository.findAllByUserId("u1");
      expect(db.select).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe("revokeAllByUserId", () => {
    it("should update multiple sessions", async () => {
      await repository.revokeAllByUserId("u1");
      expect(db.update).toHaveBeenCalled();
    });
  });
});
