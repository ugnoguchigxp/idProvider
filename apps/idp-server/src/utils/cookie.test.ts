import { describe, expect, it } from "vitest";
import { clearCookie, serializeCookie } from "./cookie.js";

describe("cookie utils", () => {
  it("serializeCookie should build cookie with security options", () => {
    const value = serializeCookie("idp_access_token", "token-value", {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: 900,
    });

    expect(value).toContain("idp_access_token=token-value");
    expect(value).toContain("Path=/");
    expect(value).toContain("HttpOnly");
    expect(value).toContain("Secure");
    expect(value).toContain("SameSite=Lax");
    expect(value).toContain("Max-Age=900");
  });

  it("serializeCookie should use defaults", () => {
    const value = serializeCookie("test", "val");
    expect(value).toBe("test=val; Path=/");
  });

  it("serializeCookie should handle negative maxAge", () => {
    const value = serializeCookie("test", "val", { maxAge: -10 });
    expect(value).toContain("Max-Age=0");
  });

  it("clearCookie should expire cookie immediately", () => {
    const value = clearCookie("idp_access_token", false);
    expect(value).toContain("idp_access_token=");
    expect(value).toContain("Max-Age=0");
    expect(value).toContain("HttpOnly");
  });
});
