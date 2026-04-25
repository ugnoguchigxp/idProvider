import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;
export type DbTransaction = Parameters<
  Parameters<DbClient["transaction"]>[0]
>[0];

export const withTransaction = async <T>(
  db: DbClient,
  handler: (tx: DbTransaction) => Promise<T>,
): Promise<T> => db.transaction(handler);

export const createDb = (
  connectionString: string,
): { db: DbClient; pool: Pool } => {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool };
};
