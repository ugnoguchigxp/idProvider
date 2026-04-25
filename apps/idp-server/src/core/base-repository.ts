import { type DbClient, type DbTransaction, withTransaction } from "@idp/db";

export abstract class BaseRepository {
  constructor(protected readonly db: DbClient) {}

  /**
   * Run a handler within a transaction.
   * If 'tx' is provided, it uses that transaction.
   * Otherwise, it creates a new transaction.
   */
  protected async runInTransaction<T>(
    handler: (tx: DbTransaction | DbClient) => Promise<T>,
    tx?: DbTransaction | DbClient,
  ): Promise<T> {
    if (tx) {
      return handler(tx);
    }

    if (typeof this.db.transaction === "function") {
      return withTransaction(this.db, handler);
    }

    return handler(this.db);
  }
}
