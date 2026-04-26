import { createHash, randomUUID } from "node:crypto";
import {
  and,
  asc,
  auditLogs,
  type DbClient,
  type DbTransaction,
  desc,
  eq,
  securityEvents,
  sql,
} from "@idp/db";
import type { SQL } from "drizzle-orm";
import { BaseRepository } from "../../core/base-repository.js";
import { recordSecurityEventMetric } from "../../core/metrics.js";

export type AuditCursor = {
  createdAt: Date;
  id: string;
};

export type ListAuditLogsInput = {
  from?: Date | undefined;
  to?: Date | undefined;
  actorUserId?: string | undefined;
  action?: string | undefined;
  resourceType?: string | undefined;
  resourceId?: string | undefined;
  limit: number;
  cursor?: AuditCursor | undefined;
};

export type ListSecurityEventsInput = {
  from?: Date | undefined;
  to?: Date | undefined;
  userId?: string | undefined;
  eventType?: string | undefined;
  limit: number;
  cursor?: AuditCursor | undefined;
};

export type AuditLogRow = {
  id: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  payload: Record<string, unknown>;
  prevHash: string | null;
  entryHash: string | null;
  integrityVersion: number;
  createdAt: Date;
};

export type SecurityEventRow = {
  id: string;
  userId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
};

const MAX_PAGE_SIZE = 200;
const AUDIT_CHAIN_LOCK_KEY = 91_000_202;
const INTEGRITY_VERSION_NONE = 0;
const INTEGRITY_VERSION_CHAINED = 1;

const shouldUseHashChain = (action: string): boolean =>
  action.startsWith("admin.");

const canonicalize = (value: unknown): string => {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    const body = entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(",");
    return `{${body}}`;
  }
  return JSON.stringify(String(value));
};

const toPageLimit = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 50;
  }
  return Math.min(Math.max(Math.floor(value), 1), MAX_PAGE_SIZE);
};

const buildCursorFilter = (
  createdAtColumn: unknown,
  idColumn: unknown,
  cursor: AuditCursor | undefined,
): SQL | undefined => {
  if (!cursor) {
    return undefined;
  }

  return sql`(
    ${createdAtColumn} < ${cursor.createdAt}
    or (${createdAtColumn} = ${cursor.createdAt} and ${idColumn}::text < ${cursor.id})
  )`;
};

const toCursor = (row: { createdAt: Date; id: string }): AuditCursor => ({
  createdAt: row.createdAt,
  id: row.id,
});

export class AuditRepository extends BaseRepository {
  private buildEntryHash(input: {
    id: string;
    createdAt: Date;
    actorUserId: string | null;
    action: string;
    resourceType: string;
    resourceId: string | null;
    payload: Record<string, unknown>;
    prevHash: string | null;
  }): string {
    const source = canonicalize({
      id: input.id,
      createdAt: input.createdAt.toISOString(),
      actorUserId: input.actorUserId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      payload: input.payload,
      prevHash: input.prevHash,
    });
    return createHash("sha256").update(source).digest("hex");
  }

  private async lockAuditChain(db: DbTransaction | DbClient): Promise<void> {
    await db.execute(
      sql`select pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY})`,
    );
  }

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
    recordSecurityEventMetric(input.eventType);
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
    if (!shouldUseHashChain(input.action)) {
      const createdAt = new Date();
      const id = randomUUID();
      await (tx ?? this.db).insert(auditLogs).values({
        id,
        actorUserId: input.actorUserId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        payload: input.payload,
        prevHash: null,
        entryHash: null,
        integrityVersion: INTEGRITY_VERSION_NONE,
        createdAt,
      });
      return;
    }

    await this.runInTransaction(async (db) => {
      await this.lockAuditChain(db);

      const [latest] = await db
        .select({
          entryHash: auditLogs.entryHash,
        })
        .from(auditLogs)
        .where(eq(auditLogs.integrityVersion, INTEGRITY_VERSION_CHAINED))
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(1);

      const createdAt = new Date();
      const id = randomUUID();
      const prevHash = latest?.entryHash ?? null;
      const payload = input.payload;
      const resourceId = input.resourceId ?? null;

      await db.insert(auditLogs).values({
        id,
        actorUserId: input.actorUserId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId,
        payload,
        prevHash,
        entryHash: this.buildEntryHash({
          id,
          createdAt,
          actorUserId: input.actorUserId,
          action: input.action,
          resourceType: input.resourceType,
          resourceId,
          payload,
          prevHash,
        }),
        integrityVersion: INTEGRITY_VERSION_CHAINED,
        createdAt,
      });
    }, tx);
  }

  async listAuditLogs(
    input: ListAuditLogsInput,
  ): Promise<{ items: AuditLogRow[]; nextCursor: AuditCursor | null }> {
    const limit = toPageLimit(input.limit);
    const conditions: SQL[] = [];

    if (input.from) {
      conditions.push(sql`${auditLogs.createdAt} >= ${input.from}`);
    }
    if (input.to) {
      conditions.push(sql`${auditLogs.createdAt} <= ${input.to}`);
    }
    if (input.actorUserId) {
      conditions.push(eq(auditLogs.actorUserId, input.actorUserId));
    }
    if (input.action) {
      conditions.push(eq(auditLogs.action, input.action));
    }
    if (input.resourceType) {
      conditions.push(eq(auditLogs.resourceType, input.resourceType));
    }
    if (input.resourceId) {
      conditions.push(eq(auditLogs.resourceId, input.resourceId));
    }

    const cursorFilter = buildCursorFilter(
      auditLogs.createdAt,
      auditLogs.id,
      input.cursor,
    );
    if (cursorFilter) {
      conditions.push(cursorFilter);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const query = this.db
      .select({
        id: auditLogs.id,
        actorUserId: auditLogs.actorUserId,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        payload: auditLogs.payload,
        prevHash: auditLogs.prevHash,
        entryHash: auditLogs.entryHash,
        integrityVersion: auditLogs.integrityVersion,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs);

    const rows = (
      whereClause
        ? await query
            .where(whereClause)
            .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
            .limit(limit + 1)
        : await query
            .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
            .limit(limit + 1)
    ) as AuditLogRow[];

    const hasNext = rows.length > limit;
    const items = hasNext ? rows.slice(0, limit) : rows;

    const tail = items.at(-1);
    return {
      items,
      nextCursor: hasNext && tail ? toCursor(tail) : null,
    };
  }

  async listSecurityEvents(
    input: ListSecurityEventsInput,
  ): Promise<{ items: SecurityEventRow[]; nextCursor: AuditCursor | null }> {
    const limit = toPageLimit(input.limit);
    const conditions: SQL[] = [];

    if (input.from) {
      conditions.push(sql`${securityEvents.createdAt} >= ${input.from}`);
    }
    if (input.to) {
      conditions.push(sql`${securityEvents.createdAt} <= ${input.to}`);
    }
    if (input.userId) {
      conditions.push(eq(securityEvents.userId, input.userId));
    }
    if (input.eventType) {
      conditions.push(eq(securityEvents.eventType, input.eventType));
    }

    const cursorFilter = buildCursorFilter(
      securityEvents.createdAt,
      securityEvents.id,
      input.cursor,
    );
    if (cursorFilter) {
      conditions.push(cursorFilter);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const query = this.db
      .select({
        id: securityEvents.id,
        userId: securityEvents.userId,
        eventType: securityEvents.eventType,
        payload: securityEvents.payload,
        createdAt: securityEvents.createdAt,
      })
      .from(securityEvents);

    const rows = (
      whereClause
        ? await query
            .where(whereClause)
            .orderBy(desc(securityEvents.createdAt), desc(securityEvents.id))
            .limit(limit + 1)
        : await query
            .orderBy(desc(securityEvents.createdAt), desc(securityEvents.id))
            .limit(limit + 1)
    ) as SecurityEventRow[];

    const hasNext = rows.length > limit;
    const items = hasNext ? rows.slice(0, limit) : rows;

    const tail = items.at(-1);
    return {
      items,
      nextCursor: hasNext && tail ? toCursor(tail) : null,
    };
  }

  async verifyIntegrityRange(input: {
    from?: Date | undefined;
    to?: Date | undefined;
  }) {
    const conditions: SQL[] = [
      eq(auditLogs.integrityVersion, INTEGRITY_VERSION_CHAINED),
    ];

    if (input.from) {
      conditions.push(sql`${auditLogs.createdAt} >= ${input.from}`);
    }
    if (input.to) {
      conditions.push(sql`${auditLogs.createdAt} <= ${input.to}`);
    }

    const rows = (await this.db
      .select({
        id: auditLogs.id,
        actorUserId: auditLogs.actorUserId,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        payload: auditLogs.payload,
        prevHash: auditLogs.prevHash,
        entryHash: auditLogs.entryHash,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id))) as AuditLogRow[];

    if (rows.length === 0) {
      return {
        ok: true,
        checked: 0,
        firstId: null,
        lastId: null,
        brokenAt: null,
        reason: null,
      };
    }

    const [first] = rows;
    const [last] = rows.slice(-1);
    if (!first || !last) {
      return {
        ok: true,
        checked: 0,
        firstId: null,
        lastId: null,
        brokenAt: null,
        reason: null,
      };
    }

    const [previous] = await this.db
      .select({
        entryHash: auditLogs.entryHash,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.integrityVersion, INTEGRITY_VERSION_CHAINED),
          sql`(
            ${auditLogs.createdAt} < ${first.createdAt}
            or (${auditLogs.createdAt} = ${first.createdAt} and ${auditLogs.id}::text < ${first.id})
          )`,
        ),
      )
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(1);

    let expectedPrevHash = previous?.entryHash ?? null;

    for (const row of rows) {
      if ((row.prevHash ?? null) !== (expectedPrevHash ?? null)) {
        return {
          ok: false,
          checked: rows.length,
          firstId: first.id,
          lastId: last.id,
          brokenAt: row.id,
          reason: "prev_hash_mismatch",
        };
      }

      const computed = this.buildEntryHash({
        id: row.id,
        createdAt: row.createdAt,
        actorUserId: row.actorUserId,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        payload: row.payload,
        prevHash: row.prevHash,
      });

      if (row.entryHash !== computed) {
        return {
          ok: false,
          checked: rows.length,
          firstId: first.id,
          lastId: last.id,
          brokenAt: row.id,
          reason: "entry_hash_mismatch",
        };
      }

      expectedPrevHash = row.entryHash;
    }

    return {
      ok: true,
      checked: rows.length,
      firstId: first.id,
      lastId: last.id,
      brokenAt: null,
      reason: null,
    };
  }
}
