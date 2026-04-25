import { describe, expect, it, vi } from "vitest";
import { createOidcProvider } from "./oidc-provider.js";

describe("oidc-provider factory", () => {
  it("should create a provider with correct configuration", () => {
    const env: any = {
      OAUTH_CLIENT_ID: "cid",
      OAUTH_CLIENT_SECRET: "csec",
      OIDC_ISSUER: "https://issuer.com",
      NODE_ENV: "test",
    };
    const jwks = { keys: [] };
    const authService: any = {
      getMe: vi.fn(),
      getAuthorizationSnapshot: vi.fn(),
    };

    const provider = createOidcProvider(env, jwks, authService);
    expect(provider).toBeDefined();
    expect(provider.issuer).toBe("https://issuer.com");
  });
});
