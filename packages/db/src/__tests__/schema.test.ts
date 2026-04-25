import { describe, expect, it } from "vitest";
import * as schema from "../schema.js";

describe("db schema", () => {
  it("exports tables", () => {
    expect(schema.users).toBeDefined();
    expect(schema.userEmails).toBeDefined();
  });
});
