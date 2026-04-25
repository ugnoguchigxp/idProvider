import {
  type DbClient,
  type DbTransaction,
  eq,
  userEmails,
  userPasswords,
  users,
} from "@idp/db";
import { BaseRepository } from "../../core/base-repository.js";

export class UserRepository extends BaseRepository {
  async findById(id: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    const result = await db
      .select({
        id: users.id,
        status: users.status,
        email: userEmails.email,
        createdAt: users.createdAt,
      })
      .from(users)
      .leftJoin(userEmails, eq(users.id, userEmails.userId))
      .where(eq(users.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  async findWithPasswordById(id: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    const result = await db
      .select({
        id: users.id,
        passwordHash: userPasswords.passwordHash,
      })
      .from(users)
      .innerJoin(userPasswords, eq(users.id, userPasswords.userId))
      .where(eq(users.id, id))
      .limit(1);
    return result[0] ?? null;
  }

  async findByEmail(email: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    const result = await db
      .select({
        id: users.id,
        status: users.status,
        email: userEmails.email,
        isVerified: userEmails.isVerified,
      })
      .from(userEmails)
      .innerJoin(users, eq(userEmails.userId, users.id))
      .where(eq(userEmails.email, email))
      .limit(1);
    return result[0] ?? null;
  }

  async findWithPasswordByEmail(email: string, tx?: DbTransaction | DbClient) {
    const db = tx ?? this.db;
    const result = await db
      .select({
        id: users.id,
        passwordHash: userPasswords.passwordHash,
        isVerified: userEmails.isVerified,
      })
      .from(userEmails)
      .innerJoin(users, eq(userEmails.userId, users.id))
      .innerJoin(userPasswords, eq(users.id, userPasswords.userId))
      .where(eq(userEmails.email, email))
      .limit(1);
    return result[0] ?? null;
  }

  async create(
    input: {
      email: string;
      passwordHash: string;
      status?: "active" | "suspended";
    },
    tx?: DbTransaction | DbClient,
  ) {
    return this.runInTransaction(async (db) => {
      const [user] = await db
        .insert(users)
        .values({ status: input.status ?? "active" })
        .returning({
          id: users.id,
          status: users.status,
          createdAt: users.createdAt,
        });

      if (!user) throw new Error("Failed to create user");

      await db.insert(userEmails).values({
        userId: user.id,
        email: input.email,
        isPrimary: true,
        isVerified: false,
      });

      await db.insert(userPasswords).values({
        userId: user.id,
        passwordHash: input.passwordHash,
      });

      return user;
    }, tx);
  }

  async update(
    userId: string,
    data: {
      emailVerified?: boolean;
      passwordHash?: string;
      displayName?: string;
    },
    tx?: DbTransaction | DbClient,
  ) {
    await this.runInTransaction(async (db) => {
      if (data.emailVerified !== undefined) {
        await db
          .update(userEmails)
          .set({ isVerified: data.emailVerified })
          .where(eq(userEmails.userId, userId));
      }
      if (data.passwordHash !== undefined) {
        await db
          .update(userPasswords)
          .set({ passwordHash: data.passwordHash, updatedAt: new Date() })
          .where(eq(userPasswords.userId, userId));
      }
    }, tx);
  }
}
