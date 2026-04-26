import {
  type AdapterFactory,
  type Configuration,
  Provider,
} from "oidc-provider";
import type { AppEnv } from "../config/env.js";
import { verifyOidcClientSecretMetadata } from "./oidc-provider-adapter.js";

export type OidcAccountResolver = {
  getMe: (userId: string) => Promise<{
    userId: string;
    email?: string | null;
    emailVerified?: boolean | null;
    profile?: {
      displayName?: string | null;
      givenName?: string | null;
      familyName?: string | null;
      preferredUsername?: string | null;
      locale?: string | null;
      zoneinfo?: string | null;
    };
    profileUpdatedAt?: Date | string | null;
  }>;
  getAuthorizationSnapshot: (userId: string) => Promise<{
    permissions: string[];
    entitlements: Record<string, unknown>;
  }>;
};

export const buildOidcClaims = (
  sub: string,
  me: Awaited<ReturnType<OidcAccountResolver["getMe"]>>,
  snapshot: Awaited<
    ReturnType<OidcAccountResolver["getAuthorizationSnapshot"]>
  >,
) => {
  const claims: { sub: string } & Record<string, unknown> = {
    sub,
    email: me.email,
    email_verified: me.emailVerified ?? false,
    permissions: snapshot.permissions,
    entitlements: snapshot.entitlements,
  };

  if (me.profile?.displayName) claims.name = me.profile.displayName;
  if (me.profile?.givenName) claims.given_name = me.profile.givenName;
  if (me.profile?.familyName) claims.family_name = me.profile.familyName;
  if (me.profile?.preferredUsername) {
    claims.preferred_username = me.profile.preferredUsername;
  }
  if (me.profile?.locale) claims.locale = me.profile.locale;
  if (me.profile?.zoneinfo) claims.zoneinfo = me.profile.zoneinfo;

  if (me.profileUpdatedAt) {
    const updatedAt =
      me.profileUpdatedAt instanceof Date
        ? me.profileUpdatedAt
        : new Date(me.profileUpdatedAt);
    const epochSeconds = Math.floor(updatedAt.getTime() / 1000);
    if (Number.isFinite(epochSeconds)) {
      claims.updated_at = epochSeconds;
    }
  }

  return claims;
};

export const createOidcProvider = (
  env: AppEnv,
  jwks: { keys: Record<string, unknown>[] },
  accountResolver: OidcAccountResolver,
  adapter?: AdapterFactory,
): Provider => {
  const redirectUris =
    env.OIDC_CLIENT_REDIRECT_URIS?.length > 0
      ? env.OIDC_CLIENT_REDIRECT_URIS
      : ["http://localhost:5173/callback"];

  const configuration: Configuration = {
    clients: [
      {
        client_id: env.OAUTH_CLIENT_ID,
        client_secret: env.OAUTH_CLIENT_SECRET,
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: redirectUris,
        response_types: ["code"],
        token_endpoint_auth_method: "client_secret_basic",
      },
    ],
    pkce: {
      required: () => true,
    },
    claims: {
      openid: ["sub"],
      email: ["email", "email_verified"],
      profile: [
        "name",
        "given_name",
        "family_name",
        "preferred_username",
        "locale",
        "zoneinfo",
        "updated_at",
      ],
      permissions: ["permissions"],
      entitlements: ["entitlements"],
    },
    scopes: [
      "openid",
      "profile",
      "email",
      "offline_access",
      "permissions",
      "entitlements",
    ],
    interactions: {
      url: async (_ctx, interaction) => `/interaction/${interaction.uid}`,
    },
    features: {
      devInteractions: { enabled: env.NODE_ENV !== "production" },
      introspection: { enabled: true },
      revocation: { enabled: true },
      rpInitiatedLogout: { enabled: true },
      userinfo: { enabled: true },
    },
    ...(adapter ? { adapter } : {}),
    findAccount: async (_ctx, sub) => {
      const me = await accountResolver.getMe(sub).catch(() => null);
      if (!me) {
        return undefined;
      }
      const snapshot = await accountResolver.getAuthorizationSnapshot(sub);
      return {
        accountId: sub,
        claims: async () => buildOidcClaims(sub, me, snapshot),
      };
    },
    jwks,
  };

  const provider = new Provider(env.OIDC_ISSUER, configuration);
  installHashedClientSecretVerifier(provider);
  return provider;
};

type ClientWithSecretMetadata = {
  clientSecret?: string;
  compareClientSecret(actual: string): boolean | Promise<boolean>;
};

type ProviderWithClientPrototype = Provider & {
  Client?: {
    prototype: ClientWithSecretMetadata;
  };
};

const patchedClientPrototypes = new WeakSet<ClientWithSecretMetadata>();

const installHashedClientSecretVerifier = (provider: Provider): void => {
  const clientPrototype = (provider as ProviderWithClientPrototype).Client
    ?.prototype;
  if (!clientPrototype) {
    return;
  }
  if (patchedClientPrototypes.has(clientPrototype)) {
    return;
  }

  const originalCompareClientSecret = clientPrototype.compareClientSecret;
  clientPrototype.compareClientSecret = async function compareClientSecret(
    this: ClientWithSecretMetadata,
    actual: string,
  ) {
    if (await verifyOidcClientSecretMetadata(actual, this.clientSecret)) {
      return true;
    }
    return originalCompareClientSecret.call(this, actual);
  };
  patchedClientPrototypes.add(clientPrototype);
};
