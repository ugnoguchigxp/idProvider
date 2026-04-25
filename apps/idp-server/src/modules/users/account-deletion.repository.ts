import {
  and,
  type DbClient,
  type DbTransaction,
  eq,
  gt,
  isNotNull,
  isNull,
  legalHolds,
  lt,
  or,
  userSessions,
  users,
} from "@idp/db";
import { BaseRepository } from "../../core/base-repository.js";

export class AccountDeletionRepository extends BaseRepository {
  async markAsDeleted(
    userId: string,
    data: {
      deletedAt: Date;
      deletionRequestedAt: Date;
      deletionDueAt: Date;
    },
    tx?: DbTransaction | DbClient,
  ) {
    return this.runInTransaction(async (db) => {
      const updated = await db
        .update(users)
        .set({
          status: "deleted",
          deletedAt: data.deletedAt,
          deletionRequestedAt: data.deletionRequestedAt,
          deletionDueAt: data.deletionDueAt,
        })
        .where(and(eq(users.id, userId), eq(users.status, "active")))
        .returning({ deletionDueAt: users.deletionDueAt });

      if (updated.length === 0) {
        return null;
      }

      await db
        .update(userSessions)
        .set({ revokedAt: data.deletedAt })
        .where(eq(userSessions.userId, userId));

      return updated[0] ?? null;
    }, tx);
  }

  async findDeletionScheduleByUserId(userId: string) {
    const result = await this.db
      .select({ deletionDueAt: users.deletionDueAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return result[0] ?? null;
  }

  async findDueDeletions(now: Date, limit: number) {
    return this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.status, "deleted"),
          isNotNull(users.deletionDueAt),
          or(lt(users.deletionDueAt, now), eq(users.deletionDueAt, now)),
        ),
      )
      .limit(limit);
  }

  async hasActiveLegalHold(userId: string) {
    const result = await this.db
      .select({ id: legalHolds.id })
      .from(legalHolds)
      .where(
        and(
          eq(legalHolds.userId, userId),
          or(
            isNull(legalHolds.expiresAt),
            gt(legalHolds.expiresAt, new Date()),
          ),
        ),
      )
      .limit(1);
    return result.length > 0;
  }

  async physicallyDeleteUser(userId: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    await db.delete(users).where(eq(users.id, userId));
  }
}
