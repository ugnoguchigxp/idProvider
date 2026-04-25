import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import { createLogger } from "./logger.js";

vi.mock("pino", () => {
  const mockPino = vi
    .fn()
    .mockReturnValue({ info: vi.fn(), error: vi.fn(), level: "info" });
  (mockPino as any).stdTimeFunctions = {
    isoTime: vi.fn().mockReturnValue("2026-04-25T00:00:00.000Z"),
  };
  return {
    default: mockPino,
  };
});

describe("logger", () => {
  it("should call pino factory with correct level", () => {
    createLogger("info");
    expect(pino).toHaveBeenCalledWith(
      expect.objectContaining({ level: "info" }),
    );
  });
});
