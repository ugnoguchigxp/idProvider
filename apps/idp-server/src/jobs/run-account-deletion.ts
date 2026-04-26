import { createDb } from "@idp/db";
import { loadEnv } from "../config/env.js";
import { createLogger } from "../core/logger.js";
import { runAccountDeletionJob } from "./account-deletion.js";

const bootstrap = async () => {
  const env = loadEnv(process.env);
  const logger = createLogger(env.LOG_LEVEL);
  const { db, pool } = createDb(env.DATABASE_URL);
  const dryRun = process.argv.includes("--dry-run");
  const lockKey = env.ACCOUNT_DELETION_JOB_LOCK_KEY;

  if (!env.ACCOUNT_DELETION_JOB_ENABLED) {
    logger.warn(
      { event: "account_deletion.job.disabled" },
      "account deletion job skipped because ACCOUNT_DELETION_JOB_ENABLED=false",
    );
    await pool.end();
    process.exit(0);
  }

  const lockClient = await pool.connect();
  try {
    const lockResult = await lockClient.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [lockKey],
    );
    const isLocked = lockResult.rows[0]?.locked === true;
    if (!isLocked) {
      logger.warn(
        { event: "account_deletion.job.skipped", lockKey },
        "account deletion job skipped because another job is running",
      );
      process.exit(0);
    }

    const summary = await runAccountDeletionJob({
      db,
      env,
      logger,
      options: { dryRun },
    });

    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } finally {
    try {
      await lockClient.query("SELECT pg_advisory_unlock($1)", [lockKey]);
    } catch (_error: unknown) {
      // Best effort unlock. Lock is also released when connection closes.
    }
    lockClient.release();
    await pool.end();
  }
};

void bootstrap().catch((error: unknown) => {
  process.stderr.write(`account_deletion_job_failed: ${String(error)}\n`);
  process.exit(1);
});
