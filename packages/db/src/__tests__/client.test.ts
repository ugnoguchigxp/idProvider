import { describe, expect, it } from "vitest";
import { createDb } from "../client.js";

describe("db client", () => {
  it("creates a db client and pool", () => {
    const { db, pool } = createDb("postgresql://localhost:5432/test");
    expect(db).toBeDefined();
    expect(pool).toBeDefined();
  });
});
