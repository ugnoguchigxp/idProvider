import { describe, expect, it } from "vitest";
import { accountDeletionRequestSchema as accountDeletionSchema } from "../schemas/account.js";
import {
  entitlementCheckRequestSchema,
  loginRequestSchema,
  mfaRecoveryRegenerateRequestSchema,
  mfaVerifyRequestSchema,
  signupRequestSchema,
} from "../schemas/auth.js";
import { revokeSessionRequestSchema } from "../schemas/session.js";
import { updateUserProfileRequestSchema } from "../schemas/user.js";

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
      mfaRecoveryCode: "ABCDE-FGHJK-LMNPQ-RSTUV",
    });
    expect(parsed.email).toBe("login@example.com");
    expect(parsed.mfaRecoveryCode).toBe("ABCDE-FGHJK-LMNPQ-RSTUV");
  });

  it("loginRequestSchema rejects partial MFA factor input", () => {
    expect(() =>
      loginRequestSchema.parse({
        email: "login@example.com",
        password: "password",
        mfaCode: "123456",
      }),
    ).toThrow();
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

  it("mfaRecoveryRegenerateRequestSchema requires MFA code and factor as a pair", () => {
    expect(() =>
      mfaRecoveryRegenerateRequestSchema.parse({ mfaCode: "123456" }),
    ).toThrow();
  });

  it("entitlementCheckRequestSchema validates quantity", () => {
    const parsed = entitlementCheckRequestSchema.parse({
      key: "max_projects",
      quantity: 3,
    });
    expect(parsed.key).toBe("max_projects");

    expect(() =>
      entitlementCheckRequestSchema.parse({
        key: "max_projects",
        quantity: 0,
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

describe("account schemas", () => {
  it("accountDeletionRequestSchema allows empty payload for service-side reauth checks", () => {
    const parsed = accountDeletionSchema.parse({});
    expect(parsed).toEqual({});
  });

  it("accountDeletionRequestSchema requires MFA code and factor as a pair", () => {
    expect(() =>
      accountDeletionSchema.parse({
        mfaCode: "123456",
      }),
    ).toThrow();
  });
});

describe("user schemas", () => {
  it("updateUserProfileRequestSchema requires at least one field", () => {
    expect(() => updateUserProfileRequestSchema.parse({})).toThrow();
  });

  it("updateUserProfileRequestSchema normalizes locale and username", () => {
    const parsed = updateUserProfileRequestSchema.parse({
      preferredUsername: "  Taro_Yamada  ",
      locale: "ja-jp",
      zoneinfo: "Asia/Tokyo",
    });

    expect(parsed.preferredUsername).toBe("taro_yamada");
    expect(parsed.locale).toBe("ja-JP");
  });

  it("updateUserProfileRequestSchema rejects invalid timezone", () => {
    expect(() =>
      updateUserProfileRequestSchema.parse({
        zoneinfo: "Mars/Olympus",
      }),
    ).toThrow();
  });
});
