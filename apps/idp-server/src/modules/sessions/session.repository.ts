import {
  and,
  type DbClient,
  type DbTransaction,
  desc,
  eq,
  gt,
  isNull,
  userSessions,
} from "@idp/db";
import { BaseRepository } from "../../core/base-repository.js";

export class SessionRepository extends BaseRepository {
  async findById(id: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    const result = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  async findByAccessTokenHash(hash: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    const result = await db
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.accessTokenHash, hash),
          isNull(userSessions.revokedAt),
          gt(userSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return result[0] ?? null;
  }

  async findByRefreshTokenHash(hash: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    const result = await db
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.refreshTokenHash, hash),
          isNull(userSessions.revokedAt),
          gt(userSessions.refreshExpiresAt, new Date()),
        ),
      )
      .limit(1);
    return result[0] ?? null;
  }

  async create(
    input: {
      userId: string;
      accessTokenHash: string;
      refreshTokenHash: string;
      expiresAt: Date;
      refreshExpiresAt: Date;
      ipAddress: string | null;
      userAgent: string | null;
    },
    tx?: DbTransaction | DbClient,
  ) {
    const db = tx ?? this.db;
    const [session] = await db
      .insert(userSessions)
      .values({
        userId: input.userId,
        accessTokenHash: input.accessTokenHash,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        refreshExpiresAt: input.refreshExpiresAt,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      })
      .returning();
    return session;
  }

  async updateLastSeen(sessionId: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    await db
      .update(userSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(userSessions.id, sessionId));
  }

  async revoke(sessionId: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    await db
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(eq(userSessions.id, sessionId));
  }

  async findAllByUserId(userId: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    return db
      .select()
      .from(userSessions)
      .where(
        and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)),
      )
      .orderBy(desc(userSessions.createdAt));
  }

  async revokeAllByUserId(userId: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    await db
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)),
      );
  }
}
