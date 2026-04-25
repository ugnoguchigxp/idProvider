import { describe, expect, it, vi } from "vitest";
import { BaseRepository } from "./base-repository.js";

class TestRepository extends BaseRepository {
  public getDb() {
    return this.db;
  }
  public runTestTx(cb: any, tx?: any) {
    return this.runInTransaction(cb, tx);
  }
}

describe("BaseRepository", () => {
  it("should initialize with db client", () => {
    const db = { transaction: vi.fn() } as any;
    const repo = new TestRepository(db);
    expect(repo.getDb()).toBe(db);
  });

  it("should runInTransaction using provided tx", async () => {
    const db = { transaction: vi.fn() } as any;
    const repo = new TestRepository(db);
    const tx = { select: vi.fn() } as any;
    const cb = vi.fn().mockResolvedValue("result");

    const result = await repo.runTestTx(cb, tx);
    expect(cb).toHaveBeenCalledWith(tx);
    expect(result).toBe("result");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("should runInTransaction using db.transaction if no tx provided", async () => {
    const db = {
      transaction: vi.fn(async (cb: any) => cb("mock-tx")),
    } as any;
    const repo = new TestRepository(db);
    const cb = vi.fn().mockResolvedValue("result");

    const result = await repo.runTestTx(cb);
    expect(db.transaction).toHaveBeenCalled();
    expect(cb).toHaveBeenCalledWith("mock-tx");
    expect(result).toBe("result");
  });
});
