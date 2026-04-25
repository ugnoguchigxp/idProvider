import { ApiError } from "@idp/shared";
import type { Context } from "hono";
import { describe, expect, it, vi } from "vitest";
import { handleError } from "../middleware/error-handler.js";

describe("handleError", () => {
  it("handles ApiError", () => {
    const c = {
      get: vi.fn().mockReturnValue("trace-123"),
      newResponse: vi.fn().mockReturnValue({ status: 400 }),
    } as unknown as Context;

    const error = new ApiError(400, "TEST_ERROR", "Test message");
    handleError(error, c);

    expect(c.newResponse).toHaveBeenCalledWith(
      expect.stringContaining('"code":"TEST_ERROR"'),
      400,
      expect.anything(),
    );
  });

  it("handles unknown error as 500", () => {
    const c = {
      get: vi.fn().mockReturnValue("trace-123"),
      newResponse: vi.fn().mockReturnValue({ status: 500 }),
    } as unknown as Context;

    const error = new Error("Something bad");
    handleError(error, c);

    expect(c.newResponse).toHaveBeenCalledWith(
      expect.stringContaining('"code":"internal_error"'),
      500,
      expect.anything(),
    );
  });
});
