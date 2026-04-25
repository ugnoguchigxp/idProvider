import { type Configuration, Provider } from "oidc-provider";
import type { AppEnv } from "../config/env.js";

const toBase64Url = (value: string): string =>
  Buffer.from(value, "utf8").toString("base64url");

export const createOidcProvider = (env: AppEnv): Provider => {
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
    findAccount: async (_ctx, sub) => ({
      accountId: sub,
      claims: async () => ({
        sub,
        email: `${sub}@example.com`,
        email_verified: true,
      }),
    }),
    jwks: {
      keys: [
        {
          kty: "oct",
          k: toBase64Url(env.JWT_PRIVATE_KEY),
          alg: "HS256",
          use: "sig",
          kid: "local-hs256",
        },
      ],
    },
  };

  return new Provider(env.OIDC_ISSUER, configuration);
};
