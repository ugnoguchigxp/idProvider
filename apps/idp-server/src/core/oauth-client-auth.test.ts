import { ApiError } from "@idp/shared";
import { describe, expect, it } from "vitest";
import {
  parseOAuthClientBasicAuth,
  safeEqualString,
} from "./oauth-client-auth.js";

describe("oauth-client-auth", () => {
  it("should parse correct Basic auth", () => {
    const authHeader = `Basic ${Buffer.from("cid:csec").toString("base64")}`;
    expect(parseOAuthClientBasicAuth(authHeader)).toEqual({
      clientId: "cid",
      clientSecret: "csec",
    });
  });

  it("should throw 401 if header missing", () => {
    expect(() => parseOAuthClientBasicAuth(undefined)).toThrow(ApiError);
  });

  it("should throw 401 if credentials mismatch", () => {
    const authHeader = `Basic ${Buffer.from("wrong").toString("base64")}`;
    expect(() => parseOAuthClientBasicAuth(authHeader)).toThrow(ApiError);
  });

  it("safeEqualString should compare in constant-time for equal-length values", () => {
    expect(safeEqualString("abc", "abc")).toBe(true);
    expect(safeEqualString("abc", "abd")).toBe(false);
    expect(safeEqualString("abc", "ab")).toBe(false);
  });
});
