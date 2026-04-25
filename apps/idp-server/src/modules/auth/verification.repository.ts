import {
  and,
  type DbClient,
  type DbTransaction,
  emailVerificationTokens,
  eq,
  gt,
  isNull,
  passwordResetTokens,
} from "@idp/db";
import { BaseRepository } from "../../core/base-repository.js";

export class VerificationRepository extends BaseRepository {
  async findEmailToken(hash: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    const result = await db
      .select()
      .from(emailVerificationTokens)
      .where(
        and(
          eq(emailVerificationTokens.tokenHash, hash),
          isNull(emailVerificationTokens.consumedAt),
          gt(emailVerificationTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return result[0] ?? null;
  }

  async findPasswordResetToken(hash: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    const result = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, hash),
          isNull(passwordResetTokens.consumedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return result[0] ?? null;
  }

  async consumeEmailToken(id: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    const updated = await db
      .update(emailVerificationTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(emailVerificationTokens.id, id),
          isNull(emailVerificationTokens.consumedAt),
        ),
      )
      .returning({ id: emailVerificationTokens.id });
    return updated.length > 0;
  }

  async consumePasswordToken(id: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    const updated = await db
      .update(passwordResetTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.id, id),
          isNull(passwordResetTokens.consumedAt),
        ),
      )
      .returning({ id: passwordResetTokens.id });
    return updated.length > 0;
  }

  async consumeValidEmailTokenByHash(
    tokenHash: string,
    tx?: DbTransaction | DbClient,
  ) {
    const db = tx ?? this.db;
    const now = new Date();
    const updated = await db
      .update(emailVerificationTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(emailVerificationTokens.tokenHash, tokenHash),
          isNull(emailVerificationTokens.consumedAt),
          gt(emailVerificationTokens.expiresAt, now),
        ),
      )
      .returning({
        id: emailVerificationTokens.id,
        userId: emailVerificationTokens.userId,
      });
    return updated[0] ?? null;
  }

  async consumeValidPasswordTokenByHash(
    tokenHash: string,
    tx?: DbTransaction | DbClient,
  ) {
    const db = tx ?? this.db;
    const now = new Date();
    const updated = await db
      .update(passwordResetTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.consumedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .returning({
        id: passwordResetTokens.id,
        userId: passwordResetTokens.userId,
      });
    return updated[0] ?? null;
  }

  async createEmailToken(
    input: { userId: string; tokenHash: string; expiresAt: Date },
    tx?: DbTransaction | DbClient,
  ) {
    const db = tx ?? this.db;
    await db.insert(emailVerificationTokens).values(input);
  }

  async createPasswordToken(
    input: { userId: string; tokenHash: string; expiresAt: Date },
    tx?: DbTransaction | DbClient,
  ) {
    const db = tx ?? this.db;
    await db.insert(passwordResetTokens).values(input);
  }
}
