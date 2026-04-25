import { ApiError } from "@idp/shared";
import { describe, expect, it } from "vitest";
import { assertOAuthClientAuth } from "../core/oauth-client-auth.js";

describe("assertOAuthClientAuth", () => {
  const credentials = { clientId: "client", clientSecret: "secret" };

  it("throws if authorization header is missing", () => {
    expect(() => assertOAuthClientAuth(undefined, credentials)).toThrow(
      ApiError,
    );
  });

  it("throws if not Basic auth", () => {
    expect(() => assertOAuthClientAuth("Bearer xxx", credentials)).toThrow(
      ApiError,
    );
  });

  it("throws if format is invalid", () => {
    const auth = `Basic ${Buffer.from("invalid").toString("base64")}`;
    expect(() => assertOAuthClientAuth(auth, credentials)).toThrow(ApiError);
  });

  it("throws if credentials mismatch", () => {
    const auth = `Basic ${Buffer.from("client:wrong").toString("base64")}`;
    expect(() => assertOAuthClientAuth(auth, credentials)).toThrow(ApiError);
  });

  it("succeeds if credentials match", () => {
    const auth = `Basic ${Buffer.from("client:secret").toString("base64")}`;
    expect(() => assertOAuthClientAuth(auth, credentials)).not.toThrow();
  });
});
