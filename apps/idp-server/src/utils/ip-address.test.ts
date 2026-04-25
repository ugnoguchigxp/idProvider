import { describe, expect, it } from "vitest";
import { getIpAddress } from "./ip-address.js";

describe("getIpAddress", () => {
  it("should return first IP from comma-separated list", () => {
    expect(getIpAddress("1.1.1.1, 2.2.2.2")).toBe("1.1.1.1");
  });

  it("should handle single IP", () => {
    expect(getIpAddress("1.1.1.1")).toBe("1.1.1.1");
  });

  it("should return null for undefined", () => {
    expect(getIpAddress(undefined)).toBe(null);
  });

  it("should handle empty first part", () => {
    expect(getIpAddress(",1.1.1.1")).toBe(null);
  });
});
