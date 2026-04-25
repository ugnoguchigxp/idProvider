import {
  auditLogs,
  type DbClient,
  type DbTransaction,
  securityEvents,
} from "@idp/db";
import { BaseRepository } from "../../core/base-repository.js";

export class AuditRepository extends BaseRepository {
  async createSecurityEvent(
    input: {
      eventType: string;
      userId: string | null;
      payload: Record<string, unknown>;
    },
    tx?: DbTransaction | DbClient,
  ) {
    const db = tx ?? this.db;
    await db.insert(securityEvents).values({
      eventType: input.eventType,
      userId: input.userId,
      payload: input.payload,
    });
  }

  async createAuditLog(
    input: {
      actorUserId: string | null;
      action: string;
      resourceType: string;
      resourceId?: string;
      payload: Record<string, unknown>;
    },
    tx?: DbTransaction | DbClient,
  ) {
    const db = tx ?? this.db;
    await db.insert(auditLogs).values({
      actorUserId: input.actorUserId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      payload: input.payload,
    });
  }
}
