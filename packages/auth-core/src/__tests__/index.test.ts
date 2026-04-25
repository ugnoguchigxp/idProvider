import { describe, expect, it } from "vitest";
import * as authCore from "../index.js";

describe("auth-core exports", () => {
  it("exports AuthService", () => {
    expect(authCore.AuthService).toBeDefined();
  });
});
