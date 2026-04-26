import { describe, expect, it } from "vitest";
import {
  buildOidcClientMetadata,
  encodeOidcClientSecretHashes,
  verifyOidcClientSecretMetadata,
} from "./oidc-provider-adapter.js";
import { hashPassword } from "./password.js";

describe("oidc-provider adapter client metadata", () => {
  it("builds dynamic OIDC client metadata from active registry records", () => {
    const metadata = buildOidcClientMetadata({
      clientId: "bff-client",
      name: "BFF Client",
      redirectUris: ["https://app.example.com/callback"],
      allowedScopes: ["openid", "profile", "email", "openid"],
      secretHashes: ["$argon2id$hash"],
    });

    expect(metadata).toMatchObject({
      client_id: "bff-client",
      client_name: "BFF Client",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["https://app.example.com/callback"],
      response_types: ["code"],
      scope: "openid profile email",
      token_endpoint_auth_method: "client_secret_basic",
    });
    expect(metadata?.client_secret).toMatch(/^argon2-hashes:/);
  });

  it("does not expose unusable registry clients to oidc-provider", () => {
    expect(
      buildOidcClientMetadata({
        clientId: "missing-openid",
        name: "Missing OpenID",
        redirectUris: ["https://app.example.com/callback"],
        allowedScopes: ["profile"],
        secretHashes: ["$argon2id$hash"],
      }),
    ).toBeUndefined();

    expect(
      buildOidcClientMetadata({
        clientId: "missing-redirect",
        name: "Missing Redirect",
        redirectUris: [],
        allowedScopes: ["openid"],
        secretHashes: ["$argon2id$hash"],
      }),
    ).toBeUndefined();
  });

  it("verifies client secrets against encoded argon2 hashes", async () => {
    const metadataSecret = encodeOidcClientSecretHashes([
      await hashPassword("client-secret"),
    ]);

    await expect(
      verifyOidcClientSecretMetadata("client-secret", metadataSecret),
    ).resolves.toBe(true);
    await expect(
      verifyOidcClientSecretMetadata("wrong-secret", metadataSecret),
    ).resolves.toBe(false);
  });
});
