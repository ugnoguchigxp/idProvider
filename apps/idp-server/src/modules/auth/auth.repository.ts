import { type DbClient, type DbTransaction, loginAttempts } from "@idp/db";
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
}
