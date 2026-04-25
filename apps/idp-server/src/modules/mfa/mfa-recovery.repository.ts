import {
  and,
  type DbClient,
  type DbTransaction,
  eq,
  isNull,
  mfaRecoveryCodes,
} from "@idp/db";
import { BaseRepository } from "../../core/base-repository.js";

export type MfaRecoveryCodeRecord = {
  lookupHash: string;
  codeHash: string;
  lastChars: string;
};

export class MfaRecoveryRepository extends BaseRepository {
  async createBatch(
    userId: string,
    batchId: string,
    codes: MfaRecoveryCodeRecord[],
    tx?: DbTransaction | DbClient,
  ) {
    return this.runInTransaction(async (db) => {
      await this.revokeActiveByUserId(userId, db);
      await db.insert(mfaRecoveryCodes).values(
        codes.map((code) => ({
          userId,
          batchId,
          lookupHash: code.lookupHash,
          codeHash: code.codeHash,
          lastChars: code.lastChars,
        })),
      );
    }, tx);
  }

  async findActiveByLookupHash(
    lookupHash: string,
    tx?: DbTransaction | DbClient,
  ) {
    const db = tx ?? this.db;
    const result = await db
      .select()
      .from(mfaRecoveryCodes)
      .where(
        and(
          eq(mfaRecoveryCodes.lookupHash, lookupHash),
          isNull(mfaRecoveryCodes.usedAt),
          isNull(mfaRecoveryCodes.revokedAt),
        ),
      )
      .limit(1);
    return result[0] ?? null;
  }

  async markUsed(codeId: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    const updated = await db
      .update(mfaRecoveryCodes)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(mfaRecoveryCodes.id, codeId),
          isNull(mfaRecoveryCodes.usedAt),
          isNull(mfaRecoveryCodes.revokedAt),
        ),
      )
      .returning({ id: mfaRecoveryCodes.id });
    return updated.length > 0;
  }

  async revokeActiveByUserId(userId: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    await db
      .update(mfaRecoveryCodes)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(mfaRecoveryCodes.userId, userId),
          isNull(mfaRecoveryCodes.usedAt),
          isNull(mfaRecoveryCodes.revokedAt),
        ),
      );
  }

  async countActiveByUserId(userId: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    const rows = await db
      .select({ id: mfaRecoveryCodes.id })
      .from(mfaRecoveryCodes)
      .where(
        and(
          eq(mfaRecoveryCodes.userId, userId),
          isNull(mfaRecoveryCodes.usedAt),
          isNull(mfaRecoveryCodes.revokedAt),
        ),
      );
    return rows.length;
  }
}
