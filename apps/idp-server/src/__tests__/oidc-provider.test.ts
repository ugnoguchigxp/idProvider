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
      OIDC_ISSUER: "http://localhost:3001",
      JWT_PRIVATE_KEY: "test-key",
    } as any;

    const provider = createOidcProvider(env, { keys: [] }, {
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
    expect(claims.email).toBe("sub-123@example.com");
    expect(claims.permissions).toContain("user:read");

    // Test pkce.required
    expect(provider.config.pkce.required()).toBe(true);
  });
});
