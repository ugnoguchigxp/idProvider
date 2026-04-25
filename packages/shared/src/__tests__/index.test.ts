import { describe, expect, it } from "vitest";
import * as shared from "../index.js";

describe("shared exports", () => {
  it("exports schemas and errors", () => {
    expect(shared.signupRequestSchema).toBeDefined();
    expect(shared.loginRequestSchema).toBeDefined();
    expect(shared.updateUserProfileRequestSchema).toBeDefined();
    expect(shared.ApiError).toBeDefined();
  });
});
