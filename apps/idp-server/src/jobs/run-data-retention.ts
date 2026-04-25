import { createDb } from "@idp/db";
import { loadEnv } from "../config/env.js";
import { createLogger } from "../core/logger.js";
import { runDataRetentionJob } from "./data-retention.js";

const bootstrap = async () => {
  const env = loadEnv(process.env);
  const logger = createLogger(env.LOG_LEVEL);
  const { db, pool } = createDb(env.DATABASE_URL);
  const dryRun = process.argv.includes("--dry-run");
  const lockKey = env.RETENTION_JOB_LOCK_KEY;

  const lockClient = await pool.connect();
  try {
    const lockResult = await lockClient.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [lockKey],
    );
    const isLocked = lockResult.rows[0]?.locked === true;
    if (!isLocked) {
      logger.warn(
        { event: "retention.job.skipped", lockKey },
        "data retention job skipped because another job is running",
      );
      process.exit(0);
    }

    const summary = await runDataRetentionJob({
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
  process.stderr.write(`retention_job_failed: ${String(error)}\n`);
  process.exit(1);
});
