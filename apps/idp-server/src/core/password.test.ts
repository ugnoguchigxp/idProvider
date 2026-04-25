import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password", () => {
  it("hashes and verifies with argon2", async () => {
    const hash = await hashPassword("secret123");
    await expect(verifyPassword("secret123", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong", hash)).resolves.toBe(false);
  });

  it("supports legacy plaintext fallback", async () => {
    await expect(verifyPassword("legacy", "legacy")).resolves.toBe(true);
    await expect(verifyPassword("wrong", "legacy")).resolves.toBe(false);
  });
});
