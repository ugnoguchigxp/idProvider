import {
  and,
  type DbClient,
  type DbTransaction,
  eq,
  sql,
  userProfiles,
} from "@idp/db";
import { BaseRepository } from "../../core/base-repository.js";

export type UserProfilePatch = {
  displayName?: string | undefined;
  givenName?: string | undefined;
  familyName?: string | undefined;
  preferredUsername?: string | undefined;
  locale?: string | undefined;
  zoneinfo?: string | undefined;
};

const isUniqueViolation = (error: unknown): boolean => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: string }).code
      : undefined;
  return code === "23505";
};

export class UserProfileRepository extends BaseRepository {
  async findByUserId(userId: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    const rows = await db
      .select({
        displayName: userProfiles.displayName,
        givenName: userProfiles.givenName,
        familyName: userProfiles.familyName,
        preferredUsername: userProfiles.preferredUsername,
        locale: userProfiles.locale,
        zoneinfo: userProfiles.zoneinfo,
        updatedAt: userProfiles.updatedAt,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    return rows[0] ?? null;
  }

  async isPreferredUsernameTaken(
    preferredUsername: string,
    excludingUserId: string,
    tx?: DbTransaction | DbClient,
  ) {
    const db = tx ?? this.db;
    const rows = await db
      .select({ userId: userProfiles.userId })
      .from(userProfiles)
      .where(
        and(
          sql`lower(${userProfiles.preferredUsername}) = lower(${preferredUsername})`,
          sql`${userProfiles.userId} <> ${excludingUserId}`,
        ),
      )
      .limit(1);

    return rows.length > 0;
  }

  async upsert(
    userId: string,
    patch: UserProfilePatch,
    tx?: DbTransaction | DbClient,
  ) {
    const db = tx ?? this.db;
    const next = {
      ...patch,
      updatedAt: new Date(),
    };

    const updated = await db
      .update(userProfiles)
      .set(next)
      .where(eq(userProfiles.userId, userId))
      .returning({ userId: userProfiles.userId });

    if (updated.length > 0) {
      return;
    }

    try {
      await db.insert(userProfiles).values({
        userId,
        ...patch,
      });
    } catch (error) {
      // Another request may insert concurrently on first profile write.
      if (!isUniqueViolation(error)) {
        throw error;
      }
      await db
        .update(userProfiles)
        .set(next)
        .where(eq(userProfiles.userId, userId));
    }
  }
}
