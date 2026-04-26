import {
  and,
  type DbClient,
  desc,
  eq,
  gt,
  isNull,
  oauthClientRedirectUris,
  oauthClientScopes,
  oauthClientSecrets,
  oauthClients,
  oidcProviderStates,
  or,
  sql,
} from "@idp/db";
import type { Adapter, AdapterFactory, AdapterPayload } from "oidc-provider";
import { verifyPassword } from "./password.js";

const oidcClientSecretHashesPrefix = "argon2-hashes:";

export const encodeOidcClientSecretHashes = (hashes: string[]): string =>
  `${oidcClientSecretHashesPrefix}${Buffer.from(JSON.stringify(hashes)).toString("base64url")}`;

export const verifyOidcClientSecretMetadata = async (
  actualSecret: string,
  metadataSecret: string | undefined,
): Promise<boolean> => {
  if (!metadataSecret?.startsWith(oidcClientSecretHashesPrefix)) {
    return false;
  }

  const encoded = metadataSecret.slice(oidcClientSecretHashesPrefix.length);
  const decoded = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  );
  if (!Array.isArray(decoded)) {
    return false;
  }

  for (const hash of decoded) {
    if (typeof hash !== "string") {
      continue;
    }
    if (await verifyPassword(actualSecret, hash)) {
      return true;
    }
  }

  return false;
};

export type OidcClientRegistryRecord = {
  clientId: string;
  name: string;
  redirectUris: string[];
  allowedScopes: string[];
  secretHashes: string[];
};

export const buildOidcClientMetadata = (
  client: OidcClientRegistryRecord,
): AdapterPayload | undefined => {
  const allowedScopes = [...new Set(client.allowedScopes)];
  if (
    client.redirectUris.length === 0 ||
    !allowedScopes.includes("openid") ||
    client.secretHashes.length === 0
  ) {
    return undefined;
  }

  return {
    client_id: client.clientId,
    client_name: client.name,
    client_secret: encodeOidcClientSecretHashes(client.secretHashes),
    client_secret_expires_at: 0,
    grant_types: ["authorization_code", "refresh_token"],
    redirect_uris: client.redirectUris,
    post_logout_redirect_uris: client.redirectUris,
    response_types: ["code"],
    scope: allowedScopes.join(" "),
    token_endpoint_auth_method: "client_secret_basic",
  };
};

const consumedEpochSeconds = (date: Date): number =>
  Math.floor(date.getTime() / 1000);

const toExpiresAt = (expiresInSeconds: number): Date =>
  new Date(Date.now() + expiresInSeconds * 1000);

const toConsumedAt = (payload: AdapterPayload): Date | null => {
  if (typeof payload.consumed !== "number") {
    return null;
  }

  const consumedAt = new Date(payload.consumed * 1000);
  return Number.isFinite(consumedAt.getTime()) ? consumedAt : null;
};

const withConsumed = (
  payload: AdapterPayload,
  consumedAt: Date | null,
): AdapterPayload => {
  if (!consumedAt) {
    return payload;
  }

  return {
    ...payload,
    consumed: consumedEpochSeconds(consumedAt),
  };
};

export class PostgresOidcProviderAdapter implements Adapter {
  constructor(
    private readonly model: string,
    private readonly db: DbClient,
  ) {}

  async upsert(
    id: string,
    payload: AdapterPayload,
    expiresIn: number,
  ): Promise<void> {
    const now = new Date();
    await this.db
      .insert(oidcProviderStates)
      .values({
        model: this.model,
        id,
        payload,
        grantId: payload.grantId ?? null,
        userCode: payload.userCode ?? null,
        uid: payload.uid ?? null,
        expiresAt: toExpiresAt(expiresIn),
        consumedAt: toConsumedAt(payload),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [oidcProviderStates.model, oidcProviderStates.id],
        set: {
          payload,
          grantId: payload.grantId ?? null,
          userCode: payload.userCode ?? null,
          uid: payload.uid ?? null,
          expiresAt: toExpiresAt(expiresIn),
          consumedAt: toConsumedAt(payload),
          updatedAt: now,
        },
      });
  }

  async find(id: string): Promise<AdapterPayload | undefined> {
    if (this.model === "Client") {
      return this.findClient(id);
    }

    const rows = await this.db
      .select({
        payload: oidcProviderStates.payload,
        consumedAt: oidcProviderStates.consumedAt,
      })
      .from(oidcProviderStates)
      .where(
        and(
          eq(oidcProviderStates.model, this.model),
          eq(oidcProviderStates.id, id),
          gt(oidcProviderStates.expiresAt, new Date()),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) {
      return undefined;
    }

    return withConsumed(row.payload as AdapterPayload, row.consumedAt);
  }

  private async findClient(
    clientId: string,
  ): Promise<AdapterPayload | undefined> {
    const clientRows = await this.db
      .select()
      .from(oauthClients)
      .where(
        and(
          eq(oauthClients.clientId, clientId),
          eq(oauthClients.status, "active"),
          eq(oauthClients.clientType, "confidential"),
          eq(oauthClients.tokenEndpointAuthMethod, "client_secret_basic"),
        ),
      )
      .limit(1);

    const client = clientRows[0];
    if (!client) {
      return undefined;
    }

    const now = new Date();
    const [redirectRows, scopeRows, secretRows] = await Promise.all([
      this.db
        .select()
        .from(oauthClientRedirectUris)
        .where(eq(oauthClientRedirectUris.clientPkId, client.id)),
      this.db
        .select()
        .from(oauthClientScopes)
        .where(eq(oauthClientScopes.clientPkId, client.id)),
      this.db
        .select()
        .from(oauthClientSecrets)
        .where(
          and(
            eq(oauthClientSecrets.clientPkId, client.id),
            isNull(oauthClientSecrets.revokedAt),
            or(
              isNull(oauthClientSecrets.expiresAt),
              gt(oauthClientSecrets.expiresAt, now),
            ),
            or(
              eq(oauthClientSecrets.isPrimary, true),
              gt(oauthClientSecrets.graceUntil, now),
            ),
          ),
        )
        .orderBy(desc(oauthClientSecrets.createdAt)),
    ]);

    return buildOidcClientMetadata({
      clientId: client.clientId,
      name: client.name,
      redirectUris: redirectRows.map((row) => row.redirectUri),
      allowedScopes: scopeRows.map((row) => row.scope),
      secretHashes: secretRows.map((row) => row.secretHash),
    });
  }

  async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
    return this.findByColumn("userCode", userCode);
  }

  async findByUid(uid: string): Promise<AdapterPayload | undefined> {
    return this.findByColumn("uid", uid);
  }

  async consume(id: string): Promise<void> {
    await this.db
      .update(oidcProviderStates)
      .set({
        consumedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(oidcProviderStates.model, this.model),
          eq(oidcProviderStates.id, id),
        ),
      );
  }

  async destroy(id: string): Promise<void> {
    await this.db
      .delete(oidcProviderStates)
      .where(
        and(
          eq(oidcProviderStates.model, this.model),
          eq(oidcProviderStates.id, id),
        ),
      );
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    await this.db
      .delete(oidcProviderStates)
      .where(eq(oidcProviderStates.grantId, grantId));
  }

  private async findByColumn(
    column: "uid" | "userCode",
    value: string,
  ): Promise<AdapterPayload | undefined> {
    const selectedColumn =
      column === "uid" ? oidcProviderStates.uid : oidcProviderStates.userCode;

    const rows = await this.db
      .select({
        payload: oidcProviderStates.payload,
        consumedAt: oidcProviderStates.consumedAt,
      })
      .from(oidcProviderStates)
      .where(
        and(
          eq(oidcProviderStates.model, this.model),
          eq(selectedColumn, value),
          gt(oidcProviderStates.expiresAt, new Date()),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) {
      return undefined;
    }

    return withConsumed(row.payload as AdapterPayload, row.consumedAt);
  }
}

export const createPostgresOidcProviderAdapterFactory = (
  db: DbClient,
): AdapterFactory => {
  return (model: string) => new PostgresOidcProviderAdapter(model, db);
};

export const deleteExpiredOidcProviderStates = async (
  db: DbClient,
): Promise<number> => {
  const rows = await db
    .delete(oidcProviderStates)
    .where(sql`${oidcProviderStates.expiresAt} <= now()`)
    .returning({ id: oidcProviderStates.id });

  return rows.length;
};
