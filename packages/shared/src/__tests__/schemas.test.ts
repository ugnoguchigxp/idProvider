import { describe, expect, it } from "vitest";
import { accountDeletionRequestSchema as accountDeletionSchema } from "../schemas/account.js";
import {
  notificationUpdateSchema,
  oauthClientCreateSchema,
  oauthClientRotateSecretSchema,
  oauthClientUpdateSchema,
  socialLoginUpdateSchema,
} from "../schemas/admin.js";
import {
  entitlementCheckRequestSchema,
  googleLoginRequestSchema,
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

    expect(() =>
      loginRequestSchema.parse({
        email: "login@example.com",
        password: "password",
        mfaFactorId: crypto.randomUUID(),
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

    expect(() =>
      mfaRecoveryRegenerateRequestSchema.parse({
        mfaFactorId: crypto.randomUUID(),
      }),
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

  it("googleLoginRequestSchema rejects partial MFA factor input", () => {
    expect(() =>
      googleLoginRequestSchema.parse({
        idToken: "some-id-token",
        mfaCode: "123456",
      }),
    ).toThrow();

    expect(() =>
      googleLoginRequestSchema.parse({
        idToken: "some-id-token",
        mfaFactorId: crypto.randomUUID(),
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

    expect(() =>
      accountDeletionSchema.parse({
        mfaFactorId: crypto.randomUUID(),
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

  it("updateUserProfileRequestSchema rejects control characters", () => {
    expect(() =>
      updateUserProfileRequestSchema.parse({
        displayName: "Invalid\x00Name",
      }),
    ).toThrow();
  });

  it("updateUserProfileRequestSchema rejects invalid locale", () => {
    expect(() =>
      updateUserProfileRequestSchema.parse({
        locale: "invalid-locale-format!!",
      }),
    ).toThrow();
  });
});

describe("admin schemas", () => {
  it("socialLoginUpdateSchema normalizes providerEnabled boolean, string, array", () => {
    expect(
      socialLoginUpdateSchema.parse({
        providerEnabled: true,
        clientId: "id",
        clientSecret: "sec",
      }).providerEnabled,
    ).toBe(true);
    expect(
      socialLoginUpdateSchema.parse({
        providerEnabled: "true",
        clientId: "id",
        clientSecret: "sec",
      }).providerEnabled,
    ).toBe(true);
    expect(
      socialLoginUpdateSchema.parse({
        providerEnabled: "on",
        clientId: "id",
        clientSecret: "sec",
      }).providerEnabled,
    ).toBe(true);
    expect(
      socialLoginUpdateSchema.parse({
        providerEnabled: "false",
        clientId: "id",
        clientSecret: "sec",
      }).providerEnabled,
    ).toBe(false);
    expect(
      socialLoginUpdateSchema.parse({
        providerEnabled: ["true"],
        clientId: "id",
        clientSecret: "sec",
      }).providerEnabled,
    ).toBe(true);
    expect(
      socialLoginUpdateSchema.parse({
        providerEnabled: ["on"],
        clientId: "id",
        clientSecret: "sec",
      }).providerEnabled,
    ).toBe(true);
    expect(
      socialLoginUpdateSchema.parse({
        providerEnabled: ["false"],
        clientId: "id",
        clientSecret: "sec",
      }).providerEnabled,
    ).toBe(false);
    expect(
      socialLoginUpdateSchema.parse({
        providerEnabled: false,
        clientId: "id",
        clientSecret: "sec",
      }).providerEnabled,
    ).toBe(false);
  });

  it("notificationUpdateSchema normalizes arrays and csv strings", () => {
    expect(
      notificationUpdateSchema.parse({
        notificationRecipients: ["test@example.com"],
        alertLevels: ["Critical"],
      }).notificationRecipients,
    ).toEqual(["test@example.com"]);
    expect(
      notificationUpdateSchema.parse({
        notificationRecipients: "test1@example.com,test2@example.com",
        alertLevels: "Critical,Warning",
      }).notificationRecipients,
    ).toEqual(["test1@example.com", "test2@example.com"]);
  });

  it("oauthClientCreateSchema sets default values", () => {
    const parsed = oauthClientCreateSchema.parse({ name: "My Client" });
    expect(parsed.clientType).toBe("confidential");
    expect(parsed.tokenEndpointAuthMethod).toBe("client_secret_basic");
  });

  it("oauthClientUpdateSchema requires at least one field", () => {
    expect(() => oauthClientUpdateSchema.parse({})).toThrow();
  });

  it("oauthClientRotateSecretSchema has default grace period", () => {
    expect(oauthClientRotateSecretSchema.parse({}).gracePeriodDays).toBe(7);
  });
});
