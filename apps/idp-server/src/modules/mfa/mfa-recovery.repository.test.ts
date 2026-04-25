import { beforeEach, describe, expect, it } from "vitest";
import { createDrizzleMock } from "../../test-utils/drizzle-mock.js";
import { MfaRecoveryRepository } from "./mfa-recovery.repository.js";

describe("MfaRecoveryRepository", () => {
  let repository: MfaRecoveryRepository;
  let db: any;

  beforeEach(() => {
    db = createDrizzleMock();
    repository = new MfaRecoveryRepository(db);
  });

  it("should revoke active codes before inserting a new batch", async () => {
    await repository.createBatch("u1", "00000000-0000-0000-0000-000000000001", [
      {
        lookupHash: "lookup",
        codeHash: "hash",
        lastChars: "QRSTUVWX",
      },
    ]);

    expect(db.transaction).toHaveBeenCalled();
    expect(db.update).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
    expect(db.values).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: "u1",
        batchId: "00000000-0000-0000-0000-000000000001",
        lookupHash: "lookup",
        codeHash: "hash",
        lastChars: "QRSTUVWX",
      }),
    ]);
  });

  it("should find an active code by lookup hash", async () => {
    db.then.mockImplementation((resolve: any) =>
      resolve([{ id: "code-1", userId: "u1" }]),
    );

    const result = await repository.findActiveByLookupHash("lookup");

    expect(db.select).toHaveBeenCalled();
    expect(result?.id).toBe("code-1");
  });

  it("should mark an unused active code as used", async () => {
    db.then.mockImplementation((resolve: any) => resolve([{ id: "code-1" }]));

    const result = await repository.markUsed("code-1");

    expect(db.update).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("should report false if a code was already consumed", async () => {
    db.then.mockImplementation((resolve: any) => resolve([]));

    const result = await repository.markUsed("code-1");

    expect(result).toBe(false);
  });

  it("should count active codes for a user", async () => {
    db.then.mockImplementation((resolve: any) =>
      resolve([{ id: "code-1" }, { id: "code-2" }]),
    );

    const result = await repository.countActiveByUserId("u1");

    expect(db.select).toHaveBeenCalled();
    expect(result).toBe(2);
  });
});
