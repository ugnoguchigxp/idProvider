import {
  and,
  type DbClient,
  type DbTransaction,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  oauthClientAuditLogs,
  oauthClientRedirectUris,
  oauthClientScopes,
  oauthClientSecrets,
  oauthClients,
  or,
} from "@idp/db";
import { BaseRepository } from "../../core/base-repository.js";

export type OAuthClientRecord = typeof oauthClients.$inferSelect;

export class OAuthClientRepository extends BaseRepository {
  async findByClientId(
    clientId: string,
    tx?: DbTransaction | DbClient,
  ): Promise<OAuthClientRecord | null> {
    const db = tx ?? this.db;
    const rows = await db
      .select()
      .from(oauthClients)
      .where(eq(oauthClients.clientId, clientId))
      .limit(1);
    return rows[0] ?? null;
  }

  async findActiveByClientId(
    clientId: string,
    tx?: DbTransaction | DbClient,
  ): Promise<OAuthClientRecord | null> {
    const db = tx ?? this.db;
    const rows = await db
      .select()
      .from(oauthClients)
      .where(
        and(
          eq(oauthClients.clientId, clientId),
          eq(oauthClients.status, "active"),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async listActiveSecrets(clientPkId: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    return db
      .select()
      .from(oauthClientSecrets)
      .where(
        and(
          eq(oauthClientSecrets.clientPkId, clientPkId),
          isNull(oauthClientSecrets.revokedAt),
          or(
            isNull(oauthClientSecrets.expiresAt),
            gt(oauthClientSecrets.expiresAt, new Date()),
          ),
        ),
      )
      .orderBy(desc(oauthClientSecrets.createdAt));
  }

  async listClients(tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    const rows = await db
      .select()
      .from(oauthClients)
      .orderBy(desc(oauthClients.createdAt));

    if (rows.length === 0) {
      return [];
    }

    const clientPkIds = rows.map((row) => row.id);
    const [redirectRows, scopeRows] = await Promise.all([
      db
        .select()
        .from(oauthClientRedirectUris)
        .where(inArray(oauthClientRedirectUris.clientPkId, clientPkIds)),
      db
        .select()
        .from(oauthClientScopes)
        .where(inArray(oauthClientScopes.clientPkId, clientPkIds)),
    ]);

    const redirectByClient = new Map<string, string[]>();
    for (const row of redirectRows) {
      const current = redirectByClient.get(row.clientPkId) ?? [];
      current.push(row.redirectUri);
      redirectByClient.set(row.clientPkId, current);
    }

    const scopesByClient = new Map<string, string[]>();
    for (const row of scopeRows) {
      const current = scopesByClient.get(row.clientPkId) ?? [];
      current.push(row.scope);
      scopesByClient.set(row.clientPkId, current);
    }

    return rows.map((row) => ({
      ...row,
      redirectUris: redirectByClient.get(row.id) ?? [],
      allowedScopes: scopesByClient.get(row.id) ?? [],
    }));
  }

  async createClient(input: {
    clientId: string;
    name: string;
    clientType: string;
    tokenEndpointAuthMethod: string;
    status?: string;
    accessTokenTtlSeconds?: number | null;
    refreshTokenTtlSeconds?: number | null;
    redirectUris: string[];
    allowedScopes: string[];
    secretHash: string;
    secretHint: string;
    actorUserId: string;
  }) {
    return this.runInTransaction(async (tx) => {
      const [created] = await tx
        .insert(oauthClients)
        .values({
          clientId: input.clientId,
          name: input.name,
          clientType: input.clientType,
          tokenEndpointAuthMethod: input.tokenEndpointAuthMethod,
          status: input.status ?? "active",
          accessTokenTtlSeconds: input.accessTokenTtlSeconds ?? null,
          refreshTokenTtlSeconds: input.refreshTokenTtlSeconds ?? null,
          updatedAt: new Date(),
        })
        .returning();
      if (!created) {
        throw new Error("failed_to_create_oauth_client");
      }

      await tx.insert(oauthClientSecrets).values({
        clientPkId: created.id,
        secretHash: input.secretHash,
        secretHint: input.secretHint,
        isPrimary: true,
      });

      if (input.redirectUris.length > 0) {
        await tx.insert(oauthClientRedirectUris).values(
          input.redirectUris.map((redirectUri) => ({
            clientPkId: created.id,
            redirectUri,
          })),
        );
      }

      if (input.allowedScopes.length > 0) {
        await tx.insert(oauthClientScopes).values(
          input.allowedScopes.map((scope) => ({
            clientPkId: created.id,
            scope,
          })),
        );
      }

      await tx.insert(oauthClientAuditLogs).values({
        clientPkId: created.id,
        actorUserId: input.actorUserId,
        eventType: "oauth.client.created",
        payload: {
          clientId: created.clientId,
          status: created.status,
        },
      });

      return created;
    });
  }

  async updateClient(
    clientId: string,
    input: {
      actorUserId: string;
      name?: string;
      status?: "active" | "disabled";
      accessTokenTtlSeconds?: number | null;
      refreshTokenTtlSeconds?: number | null;
      redirectUris?: string[];
      allowedScopes?: string[];
    },
  ) {
    return this.runInTransaction(async (tx) => {
      const found = await this.findByClientId(clientId, tx);
      if (!found) {
        return null;
      }

      const [updated] = await tx
        .update(oauthClients)
        .set({
          name: input.name ?? found.name,
          status: input.status ?? found.status,
          accessTokenTtlSeconds:
            input.accessTokenTtlSeconds === undefined
              ? found.accessTokenTtlSeconds
              : input.accessTokenTtlSeconds,
          refreshTokenTtlSeconds:
            input.refreshTokenTtlSeconds === undefined
              ? found.refreshTokenTtlSeconds
              : input.refreshTokenTtlSeconds,
          updatedAt: new Date(),
        })
        .where(eq(oauthClients.id, found.id))
        .returning();
      if (!updated) {
        throw new Error("failed_to_update_oauth_client");
      }

      if (input.redirectUris) {
        await tx
          .delete(oauthClientRedirectUris)
          .where(eq(oauthClientRedirectUris.clientPkId, found.id));
        if (input.redirectUris.length > 0) {
          await tx.insert(oauthClientRedirectUris).values(
            input.redirectUris.map((redirectUri) => ({
              clientPkId: found.id,
              redirectUri,
            })),
          );
        }
      }

      if (input.allowedScopes) {
        await tx
          .delete(oauthClientScopes)
          .where(eq(oauthClientScopes.clientPkId, found.id));
        if (input.allowedScopes.length > 0) {
          await tx.insert(oauthClientScopes).values(
            input.allowedScopes.map((scope) => ({
              clientPkId: found.id,
              scope,
            })),
          );
        }
      }

      await tx.insert(oauthClientAuditLogs).values({
        clientPkId: found.id,
        actorUserId: input.actorUserId,
        eventType: "oauth.client.updated",
        payload: {
          clientId,
          status: updated.status,
        },
      });

      return updated;
    });
  }

  async rotateSecret(
    clientId: string,
    input: {
      actorUserId: string;
      secretHash: string;
      secretHint: string;
      graceUntil: Date | null;
    },
  ) {
    return this.runInTransaction(async (tx) => {
      const found = await this.findByClientId(clientId, tx);
      if (!found) {
        return null;
      }

      await tx
        .update(oauthClientSecrets)
        .set({
          isPrimary: false,
          graceUntil: input.graceUntil,
        })
        .where(
          and(
            eq(oauthClientSecrets.clientPkId, found.id),
            eq(oauthClientSecrets.isPrimary, true),
            isNull(oauthClientSecrets.revokedAt),
          ),
        );

      await tx.insert(oauthClientSecrets).values({
        clientPkId: found.id,
        secretHash: input.secretHash,
        secretHint: input.secretHint,
        isPrimary: true,
      });

      await tx
        .update(oauthClients)
        .set({ updatedAt: new Date() })
        .where(eq(oauthClients.id, found.id));

      await tx.insert(oauthClientAuditLogs).values({
        clientPkId: found.id,
        actorUserId: input.actorUserId,
        eventType: "oauth.client.secret_rotated",
        payload: {
          clientId,
          graceUntil: input.graceUntil?.toISOString() ?? null,
        },
      });

      return found;
    });
  }
}
