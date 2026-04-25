import { describe, expect, it, vi } from "vitest";
import { createOidcProvider } from "../core/oidc-provider.js";

vi.mock("oidc-provider", () => {
  return {
    Provider: vi.fn().mockImplementation((issuer, config) => ({
      issuer,
      config,
    })),
  };
});

describe("createOidcProvider", () => {
  it("creates a provider instance and configures findAccount", async () => {
    const env = {
      NODE_ENV: "test",
      OIDC_ISSUER: "http://localhost:3001",
      JWT_PRIVATE_KEY: "test-key",
    } as any;

    const provider = createOidcProvider(env, { keys: [] }, {
      getMe: vi.fn().mockResolvedValue({
        userId: "sub-123",
        email: "user@example.com",
        emailVerified: false,
      }),
      getAuthorizationSnapshot: vi.fn().mockResolvedValue({
        permissions: ["user:read"],
        entitlements: { api_access: true },
      }),
    } as any) as any;
    expect(provider).toBeDefined();

    // Test findAccount
    const account = await provider.config.findAccount({}, "sub-123");
    expect(account.accountId).toBe("sub-123");
    const claims = await account.claims();
    expect(claims.sub).toBe("sub-123");
    expect(claims.email).toBe("user@example.com");
    expect(claims.email_verified).toBe(false);
    expect(claims.permissions).toContain("user:read");

    // Test pkce.required
    expect(provider.config.pkce.required()).toBe(true);
    expect(provider.config.features.devInteractions.enabled).toBe(true);
  });

  it("disables devInteractions in production", () => {
    const env = {
      NODE_ENV: "production",
      OIDC_ISSUER: "http://localhost:3001",
      JWT_PRIVATE_KEY: "test-key",
    } as any;
    const provider = createOidcProvider(env, { keys: [] }, {
      getMe: vi.fn(),
      getAuthorizationSnapshot: vi.fn(),
    } as any) as any;

    expect(provider.config.features.devInteractions.enabled).toBe(false);
  });
});
