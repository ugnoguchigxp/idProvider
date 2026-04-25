import {
  and,
  type DbClient,
  type DbTransaction,
  eq,
  mfaFactors,
} from "@idp/db";
import { BaseRepository } from "../../core/base-repository.js";

export class MfaRepository extends BaseRepository {
  async findActiveFactorsByUserId(
    userId: string,
    tx?: DbTransaction | DbClient,
  ) {
    const db = tx ?? this.db;
    return db
      .select({
        id: mfaFactors.id,
        type: mfaFactors.type,
        secret: mfaFactors.secret,
      })
      .from(mfaFactors)
      .where(and(eq(mfaFactors.userId, userId), eq(mfaFactors.enabled, true)))
      .limit(20);
  }

  async findByFactorId(factorId: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    const result = await db
      .select()
      .from(mfaFactors)
      .where(eq(mfaFactors.id, factorId))
      .limit(1);
    return result[0] ?? null;
  }

  async create(
    input: { userId: string; factorId: string; secret: string; type: string },
    tx?: DbTransaction | DbClient,
  ) {
    const db = tx ?? this.db;
    await db.insert(mfaFactors).values({
      id: input.factorId,
      userId: input.userId,
      secret: input.secret,
      type: input.type,
      enabled: true,
    });
  }
}
