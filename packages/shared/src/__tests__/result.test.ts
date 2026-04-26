import { describe, expect, it } from "vitest";
import { err, ok } from "../types/result.js";

describe("result type", () => {
  it("ok returns ok result", () => {
    const result = ok("value");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("value");
    }
  });

  it("err returns err result", () => {
    const result = err("error message");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("error message");
    }
  });
});
