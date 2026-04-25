import { ApiError } from "@idp/shared";
import { describe, expect, it, vi } from "vitest";
import { handleError } from "./error-handler.js";

describe("error-handler middleware", () => {
  it("should handle ApiError correctly", async () => {
    const error = new ApiError(400, "bad_request", "Invalid input");
    const c = {
      get: vi.fn().mockReturnValue("t1"),
      newResponse: vi
        .fn()
        .mockImplementation((body, status) => ({ body, status })),
    } as any;

    await handleError(error, c);
    expect(c.newResponse).toHaveBeenCalledWith(
      expect.stringContaining('"code":"bad_request"'),
      400,
      expect.any(Object),
    );
  });

  it("should handle generic Error as 500", async () => {
    const error = new Error("Something went wrong");
    const c = {
      get: vi.fn(),
      newResponse: vi.fn(),
    } as any;

    await handleError(error, c);
    expect(c.newResponse).toHaveBeenCalledWith(
      expect.stringContaining('"code":"internal_error"'),
      500,
      expect.any(Object),
    );
  });
});
