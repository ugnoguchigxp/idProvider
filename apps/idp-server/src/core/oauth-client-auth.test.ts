import { ApiError } from "@idp/shared";
import { describe, expect, it } from "vitest";
import { assertOAuthClientAuth } from "./oauth-client-auth.js";

describe("oauth-client-auth", () => {
  const credentials = { clientId: "cid", clientSecret: "csec" };

  it("should pass with correct Basic auth", () => {
    const authHeader = `Basic ${Buffer.from("cid:csec").toString("base64")}`;
    expect(() => assertOAuthClientAuth(authHeader, credentials)).not.toThrow();
  });

  it("should throw 401 if header missing", () => {
    expect(() => assertOAuthClientAuth(undefined, credentials)).toThrow(
      ApiError,
    );
  });

  it("should throw 401 if credentials mismatch", () => {
    const authHeader = `Basic ${Buffer.from("wrong:wrong").toString("base64")}`;
    expect(() => assertOAuthClientAuth(authHeader, credentials)).toThrow(
      ApiError,
    );
  });
});
