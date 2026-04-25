import { describe, expect, it } from "vitest";
import * as sdk from "../index.js";

describe("server-sdk", () => {
  it("exports something", () => {
    expect(sdk).toBeDefined();
  });
});
