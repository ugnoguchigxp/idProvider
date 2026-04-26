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

  describe("rotateTokens", () => {
    it("should update session token hashes", async () => {
      db.then.mockImplementation((resolve: any) => resolve([{ id: "s1" }]));

      const result = await repository.rotateTokens("s1", "old-rt", {
        accessTokenHash: "new-at",
        refreshTokenHash: "new-rt",
        expiresAt: new Date(),
        refreshExpiresAt: new Date(),
      });

      expect(db.update).toHaveBeenCalled();
      expect(result).toBe(true);
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

  describe("findById", () => {
    it("should return session if found", async () => {
      db.then.mockImplementationOnce((resolve: any) => resolve([{ id: "s1" }]));
      const result = await repository.findById("s1");
      expect(result).toEqual({ id: "s1" });
    });

    it("should return null if not found", async () => {
      db.then.mockImplementationOnce((resolve: any) => resolve([]));
      const result = await repository.findById("s1");
      expect(result).toBeNull();
    });
  });

  describe("findByAccessTokenHash", () => {
    it("should return session with active user", async () => {
      db.then.mockImplementationOnce((resolve: any) =>
        resolve([{ id: "s1", userStatus: "active" }]),
      );
      const result = await repository.findByAccessTokenHash("hash");
      expect(result).toEqual({ id: "s1", userStatus: "active" });
    });

    it("should return null if not found", async () => {
      db.then.mockImplementationOnce((resolve: any) => resolve([]));
      const result = await repository.findByAccessTokenHash("hash");
      expect(result).toBeNull();
    });
  });

  describe("findByAccessTokenHashAny", () => {
    it("should return session regardless of expiry", async () => {
      db.then.mockImplementationOnce((resolve: any) => resolve([{ id: "s1" }]));
      const result = await repository.findByAccessTokenHashAny("hash");
      expect(result).toEqual({ id: "s1" });
    });

    it("should return null if not found", async () => {
      db.then.mockImplementationOnce((resolve: any) => resolve([]));
      const result = await repository.findByAccessTokenHashAny("hash");
      expect(result).toBeNull();
    });
  });

  describe("findByRefreshTokenHash", () => {
    it("should return session with active user", async () => {
      db.then.mockImplementationOnce((resolve: any) =>
        resolve([{ id: "s1", userStatus: "active" }]),
      );
      const result = await repository.findByRefreshTokenHash("hash");
      expect(result).toEqual({ id: "s1", userStatus: "active" });
    });

    it("should return null if not found", async () => {
      db.then.mockImplementationOnce((resolve: any) => resolve([]));
      const result = await repository.findByRefreshTokenHash("hash");
      expect(result).toBeNull();
    });
  });
});
