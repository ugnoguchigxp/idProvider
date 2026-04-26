import { describe, expect, it, vi } from "vitest";
import { buildOidcClaims, createOidcProvider } from "./oidc-provider.js";

describe("oidc-provider factory", () => {
  it("should create a provider with correct configuration", () => {
    const env: any = {
      OAUTH_CLIENT_ID: "cid",
      OAUTH_CLIENT_SECRET: "csec",
      OIDC_ISSUER: "https://issuer.com",
      NODE_ENV: "production",
    };
    const jwks = { keys: [] };
    const authService: any = {
      getMe: vi.fn(),
      getAuthorizationSnapshot: vi.fn(),
    };
    const noopAdapterFactory = vi.fn(() => ({
      upsert: vi.fn(async () => {}),
      find: vi.fn(async () => undefined),
      findByUserCode: vi.fn(async () => undefined),
      findByUid: vi.fn(async () => undefined),
      consume: vi.fn(async () => {}),
      destroy: vi.fn(async () => {}),
      revokeByGrantId: vi.fn(async () => {}),
    }));

    const provider = createOidcProvider(
      env,
      jwks,
      authService,
      noopAdapterFactory,
    );
    expect(provider).toBeDefined();
    expect(provider.issuer).toBe("https://issuer.com");
  });
});

describe("buildOidcClaims", () => {
  it("includes profile claims and updated_at when values exist", () => {
    const claims = buildOidcClaims(
      "user-1",
      {
        userId: "user-1",
        email: "user@example.com",
        emailVerified: true,
        profile: {
          displayName: "Taro Yamada",
          givenName: "Taro",
          familyName: "Yamada",
          preferredUsername: "taro",
          locale: "ja-JP",
          zoneinfo: "Asia/Tokyo",
        },
        profileUpdatedAt: new Date("2026-01-02T03:04:05.000Z"),
      },
      { permissions: ["read:me"], entitlements: { feature_x: true } },
    );

    expect(claims).toMatchObject({
      sub: "user-1",
      email: "user@example.com",
      email_verified: true,
      name: "Taro Yamada",
      given_name: "Taro",
      family_name: "Yamada",
      preferred_username: "taro",
      locale: "ja-JP",
      zoneinfo: "Asia/Tokyo",
      permissions: ["read:me"],
      entitlements: { feature_x: true },
      updated_at: 1767323045,
    });
  });

  it("omits null profile fields", () => {
    const claims = buildOidcClaims(
      "user-2",
      {
        userId: "user-2",
        email: "user2@example.com",
        emailVerified: false,
        profile: {
          displayName: null,
          givenName: null,
          familyName: null,
          preferredUsername: null,
          locale: null,
          zoneinfo: null,
        },
        profileUpdatedAt: null,
      },
      { permissions: [], entitlements: {} },
    );

    expect(claims).toEqual({
      sub: "user-2",
      email: "user2@example.com",
      email_verified: false,
      permissions: [],
      entitlements: {},
    });
  });
});
