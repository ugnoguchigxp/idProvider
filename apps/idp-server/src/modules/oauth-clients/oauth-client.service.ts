import { randomBytes } from "node:crypto";
import { ApiError, ok } from "@idp/shared";
import type { AppEnv } from "../../config/env.js";
import {
  parseOAuthClientBasicAuth,
  safeEqualString,
} from "../../core/oauth-client-auth.js";
import { hashPassword, verifyPassword } from "../../core/password.js";
import type { AuditRepository } from "../audit/audit.repository.js";
import type { OAuthClientRepository } from "./oauth-client.repository.js";

type OAuthClientServiceDeps = {
  oauthClientRepository: OAuthClientRepository;
  auditRepository: AuditRepository;
  env: AppEnv;
};

const now = () => new Date();

const isSecretUsable = (secret: {
  isPrimary: boolean;
  graceUntil: Date | null;
}) => {
  if (secret.isPrimary) {
    return true;
  }
  if (!secret.graceUntil) {
    return false;
  }
  return secret.graceUntil > now();
};

const createClientSecret = () => `ocs_${randomBytes(32).toString("base64url")}`;

const secretHint = (secret: string) => secret.slice(-4);

export class OAuthClientService {
  constructor(private readonly deps: OAuthClientServiceDeps) {}

  async authenticateClientBasic(authorization: string | undefined) {
    const credentials = parseOAuthClientBasicAuth(authorization);

    const client = await this.deps.oauthClientRepository.findActiveByClientId(
      credentials.clientId,
    );

    if (client) {
      const activeSecrets =
        await this.deps.oauthClientRepository.listActiveSecrets(client.id);
      for (const secret of activeSecrets) {
        if (!isSecretUsable(secret)) {
          continue;
        }
        if (await verifyPassword(credentials.clientSecret, secret.secretHash)) {
          return ok({
            clientPkId: client.id,
            clientId: client.clientId,
            status: client.status,
          });
        }
      }
    }

    // Temporary fallback for migration period.
    if (
      safeEqualString(credentials.clientId, this.deps.env.OAUTH_CLIENT_ID) &&
      safeEqualString(
        credentials.clientSecret,
        this.deps.env.OAUTH_CLIENT_SECRET,
      )
    ) {
      return ok({
        clientPkId: null,
        clientId: this.deps.env.OAUTH_CLIENT_ID,
        status: "active",
      });
    }

    throw new ApiError(
      401,
      "invalid_client",
      "Invalid OAuth client credentials",
    );
  }

  async listClients() {
    const clients = await this.deps.oauthClientRepository.listClients();
    return ok({ clients });
  }

  async createClient(
    actorUserId: string,
    input: {
      clientId?: string;
      name: string;
      clientType: "confidential" | "public";
      tokenEndpointAuthMethod: "client_secret_basic";
      redirectUris: string[];
      allowedScopes: string[];
      accessTokenTtlSeconds?: number;
      refreshTokenTtlSeconds?: number;
    },
  ) {
    const newSecret = createClientSecret();
    const created = await this.deps.oauthClientRepository.createClient({
      clientId: input.clientId ?? `client_${randomBytes(10).toString("hex")}`,
      name: input.name,
      clientType: input.clientType,
      tokenEndpointAuthMethod: input.tokenEndpointAuthMethod,
      ...(input.accessTokenTtlSeconds !== undefined
        ? { accessTokenTtlSeconds: input.accessTokenTtlSeconds }
        : {}),
      ...(input.refreshTokenTtlSeconds !== undefined
        ? { refreshTokenTtlSeconds: input.refreshTokenTtlSeconds }
        : {}),
      redirectUris: input.redirectUris,
      allowedScopes: input.allowedScopes,
      secretHash: await hashPassword(newSecret),
      secretHint: secretHint(newSecret),
      actorUserId,
    });

    await this.deps.auditRepository.createSecurityEvent({
      eventType: "admin.oauth_client.created",
      userId: actorUserId,
      payload: {
        clientId: created.clientId,
      },
    });

    return ok({
      status: "created" as const,
      clientId: created.clientId,
      clientSecret: newSecret,
      secretHint: secretHint(newSecret),
    });
  }

  async updateClient(
    actorUserId: string,
    clientId: string,
    input: {
      name?: string;
      status?: "active" | "disabled";
      redirectUris?: string[];
      allowedScopes?: string[];
      accessTokenTtlSeconds?: number | null;
      refreshTokenTtlSeconds?: number | null;
    },
  ) {
    const updated = await this.deps.oauthClientRepository.updateClient(
      clientId,
      {
        actorUserId,
        ...input,
      },
    );
    if (!updated) {
      throw new ApiError(404, "not_found", "OAuth client not found");
    }

    await this.deps.auditRepository.createSecurityEvent({
      eventType: "admin.oauth_client.updated",
      userId: actorUserId,
      payload: {
        clientId: updated.clientId,
        status: updated.status,
      },
    });

    return ok({ status: "updated" as const, clientId: updated.clientId });
  }

  async rotateSecret(
    actorUserId: string,
    clientId: string,
    gracePeriodDays: number,
  ) {
    const newSecret = createClientSecret();
    const graceUntil =
      gracePeriodDays > 0
        ? new Date(Date.now() + gracePeriodDays * 24 * 60 * 60 * 1000)
        : null;

    const found = await this.deps.oauthClientRepository.rotateSecret(clientId, {
      actorUserId,
      secretHash: await hashPassword(newSecret),
      secretHint: secretHint(newSecret),
      graceUntil,
    });

    if (!found) {
      throw new ApiError(404, "not_found", "OAuth client not found");
    }

    await this.deps.auditRepository.createSecurityEvent({
      eventType: "admin.oauth_client.secret_rotated",
      userId: actorUserId,
      payload: {
        clientId,
        graceUntil: graceUntil?.toISOString() ?? null,
      },
    });

    return ok({
      status: "rotated" as const,
      clientId,
      clientSecret: newSecret,
      secretHint: secretHint(newSecret),
      graceUntil: graceUntil?.toISOString() ?? null,
    });
  }
}
