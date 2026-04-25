import type { AuthService } from "@idp/auth-core";
import { type Configuration, Provider } from "oidc-provider";
import type { AppEnv } from "../config/env.js";

export const createOidcProvider = (
  env: AppEnv,
  jwks: { keys: Record<string, unknown>[] },
  authService: AuthService,
): Provider => {
  const configuration: Configuration = {
    clients: [
      {
        client_id: env.OAUTH_CLIENT_ID,
        client_secret: env.OAUTH_CLIENT_SECRET,
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: ["http://localhost:5173/callback"],
        response_types: ["code"],
        token_endpoint_auth_method: "client_secret_basic",
      },
    ],
    pkce: {
      required: () => true,
    },
    features: {
      devInteractions: { enabled: true },
      introspection: { enabled: true },
      revocation: { enabled: true },
    },
    findAccount: async (_ctx, sub) => {
      const snapshot = await authService.getAuthorizationSnapshot(sub);
      return {
        accountId: sub,
        claims: async () => ({
          sub,
          email: `${sub}@example.com`,
          email_verified: true,
          permissions: snapshot.permissions,
          entitlements: snapshot.entitlements,
        }),
      };
    },
    jwks,
  };

  return new Provider(env.OIDC_ISSUER, configuration);
};
