import { describe, expect, it, vi } from "vitest";
import { traceMiddleware } from "./trace.js";

describe("trace middleware", () => {
  it("should set traceId in context and header", async () => {
    const c = {
      set: vi.fn(),
      header: vi.fn(),
    } as any;
    const next = vi.fn().mockResolvedValue(undefined);

    await traceMiddleware(c, next);

    expect(c.set).toHaveBeenCalledWith("traceId", expect.any(String));
    expect(c.header).toHaveBeenCalledWith("x-trace-id", expect.any(String));
    expect(next).toHaveBeenCalled();
  });
});
