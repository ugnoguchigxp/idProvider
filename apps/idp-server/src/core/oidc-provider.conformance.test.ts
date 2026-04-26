import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOidcProvider } from "./oidc-provider.js";

const providerSpy = vi.fn();

vi.mock("oidc-provider", () => ({
  Provider: vi.fn().mockImplementation((issuer, configuration) => {
    providerSpy(issuer, configuration);
    return {
      issuer,
      configuration,
    };
  }),
}));

describe("OIDC conformance: provider configuration", () => {
  const accountResolver = {
    getMe: vi.fn(async () => ({ userId: "u1" })),
    getAuthorizationSnapshot: vi.fn(async () => ({
      permissions: [],
      entitlements: {},
    })),
  };

  beforeEach(() => {
    providerSpy.mockReset();
  });

  it("enforces PKCE and client basic auth configuration", () => {
    createOidcProvider(
      {
        OAUTH_CLIENT_ID: "client-id",
        OAUTH_CLIENT_SECRET: "client-secret",
        OIDC_ISSUER: "https://issuer.example.com",
        OIDC_CLIENT_REDIRECT_URIS: ["https://app.example.com/callback"],
        NODE_ENV: "production",
      } as any,
      { keys: [{ kty: "RSA", kid: "k1", use: "sig" }] as any },
      accountResolver,
    );

    expect(providerSpy).toHaveBeenCalledTimes(1);
    const [, configuration] = providerSpy.mock.calls[0] as [string, any];

    expect(configuration.pkce.required({}, {})).toBe(true);
    expect(configuration.scopes).toEqual([
      "openid",
      "profile",
      "email",
      "offline_access",
      "permissions",
      "entitlements",
    ]);
    expect(configuration.clients).toEqual([
      expect.objectContaining({
        client_id: "client-id",
        client_secret: "client-secret",
        token_endpoint_auth_method: "client_secret_basic",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        redirect_uris: ["https://app.example.com/callback"],
      }),
    ]);
  });

  it("uses fallback redirect URI when OIDC_CLIENT_REDIRECT_URIS is empty", () => {
    createOidcProvider(
      {
        OAUTH_CLIENT_ID: "client-id",
        OAUTH_CLIENT_SECRET: "client-secret",
        OIDC_ISSUER: "https://issuer.example.com",
        OIDC_CLIENT_REDIRECT_URIS: [],
        NODE_ENV: "production",
      } as any,
      { keys: [{ kty: "RSA", kid: "k1", use: "sig" }] as any },
      accountResolver,
    );

    const [, configuration] = providerSpy.mock.calls[0] as [string, any];
    expect(configuration.clients[0].redirect_uris).toEqual([
      "http://localhost:5173/callback",
    ]);
  });

  it("disables dev interactions in production and enables in non-production", () => {
    createOidcProvider(
      {
        OAUTH_CLIENT_ID: "client-id",
        OAUTH_CLIENT_SECRET: "client-secret",
        OIDC_ISSUER: "https://issuer.example.com",
        OIDC_CLIENT_REDIRECT_URIS: ["https://app.example.com/callback"],
        NODE_ENV: "production",
      } as any,
      { keys: [{ kty: "RSA", kid: "k1", use: "sig" }] as any },
      accountResolver,
    );
    createOidcProvider(
      {
        OAUTH_CLIENT_ID: "client-id",
        OAUTH_CLIENT_SECRET: "client-secret",
        OIDC_ISSUER: "https://issuer.example.com",
        OIDC_CLIENT_REDIRECT_URIS: ["https://app.example.com/callback"],
        NODE_ENV: "test",
      } as any,
      { keys: [{ kty: "RSA", kid: "k1", use: "sig" }] as any },
      accountResolver,
    );

    const [, productionConfig] = providerSpy.mock.calls[0] as [string, any];
    const [, testConfig] = providerSpy.mock.calls[1] as [string, any];
    expect(productionConfig.features.devInteractions.enabled).toBe(false);
    expect(testConfig.features.devInteractions.enabled).toBe(true);
  });

  it("uses a provided persistent adapter", () => {
    const adapter = vi.fn();

    createOidcProvider(
      {
        OAUTH_CLIENT_ID: "client-id",
        OAUTH_CLIENT_SECRET: "client-secret",
        OIDC_ISSUER: "https://issuer.example.com",
        OIDC_CLIENT_REDIRECT_URIS: ["https://app.example.com/callback"],
        NODE_ENV: "production",
      } as any,
      { keys: [{ kty: "RSA", kid: "k1", use: "sig" }] as any },
      accountResolver,
      adapter,
    );

    const [, configuration] = providerSpy.mock.calls[0] as [string, any];
    expect(configuration.adapter).toBe(adapter);
  });
});
