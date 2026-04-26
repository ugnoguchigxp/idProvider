import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeyStoreService } from "../key-store-service.js";

const createDbMock = () => {
  const queue: unknown[] = [];
  const db: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    transaction: vi.fn(async (cb) => cb(db)),
    // biome-ignore lint/suspicious/noThenProperty: Drizzle-like thenable for tests
    then: vi.fn(function (this: any, resolve: (value: unknown) => unknown) {
      const next = queue.length > 0 ? queue.shift() : [];
      return Promise.resolve(next).then(resolve);
    }),
    __queue: queue,
  };
  return db;
};

describe("KeyStoreService", () => {
  let db: any;
  let service: KeyStoreService;

  beforeEach(() => {
    db = createDbMock();
    service = new KeyStoreService(db, {
      rotationIntervalHours: 24,
      gracePeriodHours: 72,
    });
  });

  it("rotateIfDue does not rotate before due", async () => {
    db.__queue.push([
      {
        kid: "k1",
        alg: "RS256",
        privateKeyPem: "pem",
        publicKeyPem: "pem",
        createdAt: new Date(),
      },
    ]);

    const result = await service.rotateIfDue();

    expect(result.rotated).toBe(false);
    expect(result.activeKid).toBe("k1");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rotateManual rotates active key", async () => {
    db.__queue.push(
      [
        {
          kid: "k1",
          alg: "RS256",
          privateKeyPem: "pem",
          publicKeyPem: "pem",
          createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        },
      ],
      [{ kid: "k1" }],
      [],
    );

    const result = await service.rotateManual("u1");

    expect(result.rotated).toBe(true);
    expect(result.previousKid).toBe("k1");
    expect(db.update).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
  });

  it("rotateEmergency revokes previous active key", async () => {
    db.__queue.push(
      [
        {
          kid: "k1",
          alg: "RS256",
          privateKeyPem: "pem",
          publicKeyPem: "pem",
          createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        },
      ],
      [{ kid: "k1" }],
      [],
    );

    await service.rotateEmergency("u1");

    const setArg = db.set.mock.calls[0]?.[0];
    expect(setArg.revokedAt).toBeInstanceOf(Date);
    expect(setArg.rotationReason).toBe("emergency");
  });

  it("listKeys maps state", async () => {
    db.__queue.push([
      {
        kid: "k-active",
        alg: "RS256",
        isActive: true,
        rotatedFromKid: null,
        rotationReason: "scheduled",
        createdAt: new Date(),
        expiresAt: null,
        revokedAt: null,
      },
      {
        kid: "k-revoked",
        alg: "RS256",
        isActive: false,
        rotatedFromKid: "k-active",
        rotationReason: "emergency",
        createdAt: new Date(),
        expiresAt: new Date(),
        revokedAt: new Date(),
      },
    ]);

    const rows = await service.listKeys();

    expect(rows[0]?.state).toBe("active");
    expect(rows[1]?.state).toBe("revoked");
  });
});
