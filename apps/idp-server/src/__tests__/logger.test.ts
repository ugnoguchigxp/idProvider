import { describe, expect, it } from "vitest";
import { createLogger } from "../core/logger.js";

describe("createLogger", () => {
  it("creates a logger with correct level", () => {
    const logger = createLogger("debug");
    expect(logger.level).toBe("debug");
  });
});
