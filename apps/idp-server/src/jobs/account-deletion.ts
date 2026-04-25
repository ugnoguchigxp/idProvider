import type { DbClient } from "@idp/db";
import type pino from "pino";
import type { AppEnv } from "../config/env.js";
import { AuditRepository } from "../modules/audit/audit.repository.js";
import { MfaRepository } from "../modules/mfa/mfa.repository.js";
import { MfaService } from "../modules/mfa/mfa.service.js";
import { AccountDeletionRepository } from "../modules/users/account-deletion.repository.js";
import { AccountDeletionService } from "../modules/users/account-deletion.service.js";
import { UserRepository } from "../modules/users/user.repository.js";

export type AccountDeletionJobOptions = {
  db: DbClient;
  env: AppEnv;
  logger: pino.Logger;
  options: {
    dryRun?: boolean;
  };
};

export const runAccountDeletionJob = async (
  jobOptions: AccountDeletionJobOptions,
) => {
  const { db, logger, options } = jobOptions;

  const accountDeletionRepository = new AccountDeletionRepository(db);
  const userRepository = new UserRepository(db);
  const auditRepository = new AuditRepository(db);
  const mfaRepository = new MfaRepository(db);

  const mfaService = new MfaService({ mfaRepository });

  const service = new AccountDeletionService({
    accountDeletionRepository,
    userRepository,
    mfaService,
    auditRepository,
    env: jobOptions.env,
    logger,
  });

  if (options.dryRun) {
    logger.info("Running account deletion job in DRY RUN mode");
    // In dry run, we just fetch what WOULD be deleted
    const now = new Date();
    const chunkSize = jobOptions.env.RETENTION_BATCH_CHUNK_SIZE;
    const usersToDelete = await accountDeletionRepository.findDueDeletions(
      now,
      chunkSize,
    );

    const summary = {
      processed: usersToDelete.length,
      wouldDelete: 0,
      deferredLegalHold: 0,
    };

    for (const user of usersToDelete) {
      const hasLegalHold = await accountDeletionRepository.hasActiveLegalHold(
        user.id,
      );
      if (hasLegalHold) {
        summary.deferredLegalHold++;
      } else {
        summary.wouldDelete++;
      }
    }

    return { ...summary, dryRun: true };
  }

  return service.finalizeDueDeletions();
};
