import {
  and,
  type DbClient,
  type DbTransaction,
  eq,
  gt,
  loginAttempts,
  sql,
} from "@idp/db";
import { BaseRepository } from "../../core/base-repository.js";

export class AuthRepository extends BaseRepository {
  async recordAttempt(
    email: string,
    success: boolean,
    ipAddress: string | null,
    reason: string = success ? "ok" : "invalid_credentials",
    tx?: DbTransaction | DbClient,
  ) {
    const db = tx ?? this.db;
    await db.insert(loginAttempts).values({
      email,
      success,
      reason,
      ipAddress,
    });
  }

  async countFailedAttemptsByIpSince(
    ipAddress: string,
    since: Date,
    tx?: DbTransaction | DbClient,
  ) {
    const db = tx ?? this.db;
    const [row] = await db
      .select({ value: sql<number>`count(*)` })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.success, false),
          eq(loginAttempts.ipAddress, ipAddress),
          gt(loginAttempts.createdAt, since),
        ),
      );
    return Number(row?.value ?? 0);
  }
}
