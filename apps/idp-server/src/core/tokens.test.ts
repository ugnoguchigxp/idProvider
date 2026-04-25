import { describe, expect, it } from "vitest";
import { createOpaqueToken, hashOpaqueToken } from "./tokens.js";

describe("token utils", () => {
  it("should create an opaque token with correct prefix", () => {
    const token = createOpaqueToken("at");
    expect(token).toMatch(/^at_[a-zA-Z0-9_-]{32,}$/);
  });

  it("should hash a token consistently", () => {
    const token = "my-token";
    const hash1 = hashOpaqueToken(token);
    const hash2 = hashOpaqueToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // sha256 hex
  });
});
