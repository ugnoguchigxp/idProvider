import {
  and,
  auditLogs,
  type DbClient,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  legalHolds,
  lt,
  or,
  securityEvents,
  sql,
  userSessions,
} from "@idp/db";
import type pino from "pino";
import type { AppEnv } from "../config/env.js";

export type DataRetentionRunOptions = {
  dryRun?: boolean;
  now?: Date;
};

export type DataRetentionRunSummary = {
  dryRun: boolean;
  auditLogs: { anonymized: number; deleted: number };
  securityEvents: { anonymized: number; deleted: number };
  sessions: { anonymized: number; deleted: number };
};

const subtractDays = (base: Date, days: number): Date =>
  new Date(base.getTime() - days * 24 * 60 * 60 * 1000);

const processIdsInChunks = async ({
  selectIds,
  processIds,
  countAll,
}: {
  selectIds: () => Promise<string[]>;
  processIds: (ids: string[]) => Promise<number>;
  countAll: (() => Promise<number>) | undefined;
}): Promise<number> => {
  if (countAll) {
    return countAll();
  }
  let total = 0;
  while (true) {
    const ids = await selectIds();
    if (ids.length === 0) {
      break;
    }
    total += await processIds(ids);
  }
  return total;
};

const buildActiveLegalHoldPredicate = (now: Date) =>
  or(isNull(legalHolds.expiresAt), gt(legalHolds.expiresAt, now));

export const runDataRetentionJob = async ({
  db,
  env,
  logger,
  options,
}: {
  db: DbClient;
  env: AppEnv;
  logger: pino.Logger;
  options?: DataRetentionRunOptions;
}): Promise<DataRetentionRunSummary> => {
  const now = options?.now ?? new Date();
  const dryRun = options?.dryRun ?? false;
  const chunkSize = env.RETENTION_BATCH_CHUNK_SIZE;

  const sessionAnonymizeBefore = subtractDays(
    now,
    env.RETENTION_SESSION_ANONYMIZE_DAYS,
  );
  const sessionDeleteBefore = subtractDays(
    now,
    env.RETENTION_SESSION_DELETE_DAYS,
  );
  const securityEventAnonymizeBefore = subtractDays(
    now,
    env.RETENTION_SECURITY_EVENT_ANONYMIZE_DAYS,
  );
  const securityEventDeleteBefore = subtractDays(
    now,
    env.RETENTION_SECURITY_EVENT_DELETE_DAYS,
  );
  const auditLogAnonymizeBefore = subtractDays(
    now,
    env.RETENTION_AUDIT_LOG_ANONYMIZE_DAYS,
  );
  const auditLogDeleteBefore = subtractDays(
    now,
    env.RETENTION_AUDIT_LOG_DELETE_DAYS,
  );

  const summary: DataRetentionRunSummary = {
    dryRun,
    auditLogs: { anonymized: 0, deleted: 0 },
    securityEvents: { anonymized: 0, deleted: 0 },
    sessions: { anonymized: 0, deleted: 0 },
  };

  const activeHold = buildActiveLegalHoldPredicate(now);

  summary.sessions.anonymized = await processIdsInChunks({
    selectIds: async () => {
      const rows = await db
        .select({ id: userSessions.id })
        .from(userSessions)
        .leftJoin(
          legalHolds,
          and(eq(legalHolds.userId, userSessions.userId), activeHold),
        )
        .where(
          and(
            lt(userSessions.refreshExpiresAt, sessionAnonymizeBefore),
            or(
              isNotNull(userSessions.ipAddress),
              isNotNull(userSessions.userAgent),
            ),
            isNull(legalHolds.id),
          ),
        )
        .limit(chunkSize);
      return rows.map((row) => row.id);
    },
    processIds: async (ids) => {
      if (dryRun) {
        return ids.length;
      }
      await db
        .update(userSessions)
        .set({ ipAddress: null, userAgent: null })
        .where(inArray(userSessions.id, ids));
      return ids.length;
    },
    countAll: dryRun
      ? async () => {
          const rows = await db
            .select({ count: sql<number>`count(*)` })
            .from(userSessions)
            .leftJoin(
              legalHolds,
              and(eq(legalHolds.userId, userSessions.userId), activeHold),
            )
            .where(
              and(
                lt(userSessions.refreshExpiresAt, sessionAnonymizeBefore),
                or(
                  isNotNull(userSessions.ipAddress),
                  isNotNull(userSessions.userAgent),
                ),
                isNull(legalHolds.id),
              ),
            );
          return Number(rows[0]?.count ?? 0);
        }
      : undefined,
  });

  summary.securityEvents.anonymized = await processIdsInChunks({
    selectIds: async () => {
      const rows = await db
        .select({ id: securityEvents.id })
        .from(securityEvents)
        .leftJoin(
          legalHolds,
          and(eq(legalHolds.userId, securityEvents.userId), activeHold),
        )
        .where(
          and(
            lt(securityEvents.createdAt, securityEventAnonymizeBefore),
            isNull(legalHolds.id),
          ),
        )
        .limit(chunkSize);
      return rows.map((row) => row.id);
    },
    processIds: async (ids) => {
      if (dryRun) {
        return ids.length;
      }
      await db
        .update(securityEvents)
        .set({ userId: null, payload: {} })
        .where(inArray(securityEvents.id, ids));
      return ids.length;
    },
    countAll: dryRun
      ? async () => {
          const rows = await db
            .select({ count: sql<number>`count(*)` })
            .from(securityEvents)
            .leftJoin(
              legalHolds,
              and(eq(legalHolds.userId, securityEvents.userId), activeHold),
            )
            .where(
              and(
                lt(securityEvents.createdAt, securityEventAnonymizeBefore),
                isNull(legalHolds.id),
              ),
            );
          return Number(rows[0]?.count ?? 0);
        }
      : undefined,
  });

  summary.auditLogs.anonymized = await processIdsInChunks({
    selectIds: async () => {
      const rows = await db
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .leftJoin(
          legalHolds,
          and(eq(legalHolds.userId, auditLogs.actorUserId), activeHold),
        )
        .where(
          and(
            lt(auditLogs.createdAt, auditLogAnonymizeBefore),
            isNull(legalHolds.id),
          ),
        )
        .limit(chunkSize);
      return rows.map((row) => row.id);
    },
    processIds: async (ids) => {
      if (dryRun) {
        return ids.length;
      }
      await db
        .update(auditLogs)
        .set({ actorUserId: null, resourceId: null, payload: {} })
        .where(inArray(auditLogs.id, ids));
      return ids.length;
    },
    countAll: dryRun
      ? async () => {
          const rows = await db
            .select({ count: sql<number>`count(*)` })
            .from(auditLogs)
            .leftJoin(
              legalHolds,
              and(eq(legalHolds.userId, auditLogs.actorUserId), activeHold),
            )
            .where(
              and(
                lt(auditLogs.createdAt, auditLogAnonymizeBefore),
                isNull(legalHolds.id),
              ),
            );
          return Number(rows[0]?.count ?? 0);
        }
      : undefined,
  });

  summary.sessions.deleted = await processIdsInChunks({
    selectIds: async () => {
      const rows = await db
        .select({ id: userSessions.id })
        .from(userSessions)
        .leftJoin(
          legalHolds,
          and(eq(legalHolds.userId, userSessions.userId), activeHold),
        )
        .where(
          and(
            lt(userSessions.refreshExpiresAt, sessionDeleteBefore),
            isNull(legalHolds.id),
          ),
        )
        .limit(chunkSize);
      return rows.map((row) => row.id);
    },
    processIds: async (ids) => {
      if (dryRun) {
        return ids.length;
      }
      await db.delete(userSessions).where(inArray(userSessions.id, ids));
      return ids.length;
    },
    countAll: dryRun
      ? async () => {
          const rows = await db
            .select({ count: sql<number>`count(*)` })
            .from(userSessions)
            .leftJoin(
              legalHolds,
              and(eq(legalHolds.userId, userSessions.userId), activeHold),
            )
            .where(
              and(
                lt(userSessions.refreshExpiresAt, sessionDeleteBefore),
                isNull(legalHolds.id),
              ),
            );
          return Number(rows[0]?.count ?? 0);
        }
      : undefined,
  });

  summary.securityEvents.deleted = await processIdsInChunks({
    selectIds: async () => {
      const rows = await db
        .select({ id: securityEvents.id })
        .from(securityEvents)
        .leftJoin(
          legalHolds,
          and(eq(legalHolds.userId, securityEvents.userId), activeHold),
        )
        .where(
          and(
            lt(securityEvents.createdAt, securityEventDeleteBefore),
            isNull(legalHolds.id),
          ),
        )
        .limit(chunkSize);
      return rows.map((row) => row.id);
    },
    processIds: async (ids) => {
      if (dryRun) {
        return ids.length;
      }
      await db.delete(securityEvents).where(inArray(securityEvents.id, ids));
      return ids.length;
    },
    countAll: dryRun
      ? async () => {
          const rows = await db
            .select({ count: sql<number>`count(*)` })
            .from(securityEvents)
            .leftJoin(
              legalHolds,
              and(eq(legalHolds.userId, securityEvents.userId), activeHold),
            )
            .where(
              and(
                lt(securityEvents.createdAt, securityEventDeleteBefore),
                isNull(legalHolds.id),
              ),
            );
          return Number(rows[0]?.count ?? 0);
        }
      : undefined,
  });

  summary.auditLogs.deleted = await processIdsInChunks({
    selectIds: async () => {
      const rows = await db
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .leftJoin(
          legalHolds,
          and(eq(legalHolds.userId, auditLogs.actorUserId), activeHold),
        )
        .where(
          and(
            lt(auditLogs.createdAt, auditLogDeleteBefore),
            isNull(legalHolds.id),
          ),
        )
        .limit(chunkSize);
      return rows.map((row) => row.id);
    },
    processIds: async (ids) => {
      if (dryRun) {
        return ids.length;
      }
      await db.delete(auditLogs).where(inArray(auditLogs.id, ids));
      return ids.length;
    },
    countAll: dryRun
      ? async () => {
          const rows = await db
            .select({ count: sql<number>`count(*)` })
            .from(auditLogs)
            .leftJoin(
              legalHolds,
              and(eq(legalHolds.userId, auditLogs.actorUserId), activeHold),
            )
            .where(
              and(
                lt(auditLogs.createdAt, auditLogDeleteBefore),
                isNull(legalHolds.id),
              ),
            );
          return Number(rows[0]?.count ?? 0);
        }
      : undefined,
  });

  if (!dryRun) {
    await db.insert(auditLogs).values({
      actorUserId: null,
      action: "system.retention.execute",
      resourceType: "retention_job",
      payload: {
        executedAt: now.toISOString(),
        summary,
      },
    });
  }

  logger.info(
    {
      event: "retention.job.completed",
      dryRun,
      summary,
    },
    "data retention job completed",
  );

  return summary;
};
