import {
  and,
  type DbClient,
  type DbTransaction,
  eq,
  externalIdentities,
} from "@idp/db";
import { BaseRepository } from "../../core/base-repository.js";

export class IdentityRepository extends BaseRepository {
  async findByProvider(
    provider: string,
    providerSubject: string,
    tx?: DbTransaction | DbClient,
  ) {
    const db = tx ?? this.db;
    const result = await db
      .select()
      .from(externalIdentities)
      .where(
        and(
          eq(externalIdentities.provider, provider),
          eq(externalIdentities.providerSubject, providerSubject),
        ),
      )
      .limit(1);
    return result[0] ?? null;
  }

  async create(
    input: {
      userId: string;
      provider: string;
      providerSubject: string;
      email: string;
    },
    tx?: DbTransaction | DbClient,
  ) {
    const db = tx ?? this.db;
    await db.insert(externalIdentities).values({
      userId: input.userId,
      provider: input.provider,
      providerSubject: input.providerSubject,
      email: input.email,
    });
  }

  async delete(
    userId: string,
    provider: string,
    subject: string,
    tx?: DbTransaction | DbClient,
  ) {
    const db = tx ?? this.db;
    await db
      .delete(externalIdentities)
      .where(
        and(
          eq(externalIdentities.userId, userId),
          eq(externalIdentities.provider, provider),
          eq(externalIdentities.providerSubject, subject),
        ),
      );
  }
}
