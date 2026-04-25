import { describe, expect, it } from "vitest";
import { ApiError } from "../errors/api-error.js";

describe("ApiError", () => {
  it("creates an error with status and code", () => {
    const error = new ApiError(400, "BAD_REQUEST", "Something went wrong");
    expect(error.status).toBe(400);
    expect(error.code).toBe("BAD_REQUEST");
    expect(error.message).toBe("Something went wrong");
    expect(error.name).toBe("ApiError");
  });
});
