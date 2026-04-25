import { describe, expect, it } from "vitest";
import {
  loginRequestSchema,
  mfaVerifyRequestSchema,
  signupRequestSchema,
} from "../schemas/auth.js";
import { revokeSessionRequestSchema } from "../schemas/session.js";

describe("auth schemas", () => {
  it("signupRequestSchema normalizes email", () => {
    const parsed = signupRequestSchema.parse({
      email: "  USER@example.com ",
      password: "very-strong-password",
      displayName: "User",
    });
    expect(parsed.email).toBe("user@example.com");
  });

  it("loginRequestSchema normalizes email", () => {
    const parsed = loginRequestSchema.parse({
      email: " LOGIN@example.com ",
      password: "password",
    });
    expect(parsed.email).toBe("login@example.com");
  });

  it("mfaVerifyRequestSchema validates code", () => {
    const factorId = crypto.randomUUID();
    const parsed = mfaVerifyRequestSchema.parse({
      factorId,
      code: "123456",
    });
    expect(parsed.code).toBe("123456");

    expect(() =>
      mfaVerifyRequestSchema.parse({
        factorId,
        code: "abc",
      }),
    ).toThrow();
  });
});

describe("session schemas", () => {
  it("revokeSessionRequestSchema validates uuid", () => {
    const sessionId = crypto.randomUUID();
    const parsed = revokeSessionRequestSchema.parse({ sessionId });
    expect(parsed.sessionId).toBe(sessionId);

    expect(() =>
      revokeSessionRequestSchema.parse({ sessionId: "not-a-uuid" }),
    ).toThrow();
  });
});
