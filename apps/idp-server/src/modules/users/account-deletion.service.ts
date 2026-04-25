import { ApiError, ok } from "@idp/shared";
import type pino from "pino";
import type { AppEnv } from "../../config/env.js";
import { verifyPassword } from "../../core/password.js";
import type { AuditRepository } from "../audit/audit.repository.js";
import type { MfaService } from "../mfa/mfa.service.js";
import type { AccountDeletionRepository } from "./account-deletion.repository.js";
import type { UserRepository } from "./user.repository.js";

export type AccountDeletionServiceDependencies = {
  accountDeletionRepository: AccountDeletionRepository;
  userRepository: UserRepository;
  mfaService: MfaService;
  auditRepository: AuditRepository;
  env: AppEnv;
  logger: pino.Logger;
};

export class AccountDeletionService {
  constructor(private deps: AccountDeletionServiceDependencies) {}

  async requestDeletion(
    userId: string,
    reauth: {
      currentPassword?: string | undefined;
      mfaCode?: string | undefined;
      mfaFactorId?: string | undefined;
    },
  ) {
    const user = await this.deps.userRepository.findById(userId);

    if (!user || (user.status !== "active" && user.status !== "deleted")) {
      throw new ApiError(401, "unauthorized", "User not found or not active");
    }

    if (user.status === "deleted") {
      const schedule =
        await this.deps.accountDeletionRepository.findDeletionScheduleByUserId(
          userId,
        );
      if (schedule?.deletionDueAt) {
        return ok({
          status: "scheduled",
          deletionDueAt: schedule.deletionDueAt.toISOString(),
          alreadyDeleted: true,
        });
      }
      throw new ApiError(401, "unauthorized", "User not found or not active");
    }

    const hasPassword = Boolean(reauth.currentPassword);
    const hasMfaCode = Boolean(reauth.mfaCode);
    const hasMfaFactorId = Boolean(reauth.mfaFactorId);

    if (!hasPassword && !hasMfaCode && !hasMfaFactorId) {
      throw new ApiError(
        400,
        "reauth_required",
        "Password or MFA reauthentication is required",
      );
    }
    if (hasMfaCode !== hasMfaFactorId) {
      throw new ApiError(
        400,
        "reauth_required",
        "mfaCode and mfaFactorId must be provided together",
      );
    }

    if (hasPassword) {
      const userWithPass =
        await this.deps.userRepository.findWithPasswordById(userId);
      const isValid = userWithPass
        ? await verifyPassword(
            reauth.currentPassword as string,
            userWithPass.passwordHash,
          )
        : false;
      if (!isValid) {
        throw new ApiError(401, "invalid_reauth", "Invalid password");
      }
    }

    if (hasMfaCode && hasMfaFactorId) {
      try {
        const result = await this.deps.mfaService.verifyMfa(
          userId,
          reauth.mfaFactorId as string,
          reauth.mfaCode as string,
        );
        if (!result.ok) {
          throw new ApiError(401, "invalid_reauth", "Invalid MFA code");
        }
      } catch (error) {
        if (!(error instanceof ApiError) || error.status >= 500) {
          throw error;
        }
        throw new ApiError(401, "invalid_reauth", "Invalid MFA code");
      }
    }

    const now = new Date();
    const graceDays = this.deps.env.ACCOUNT_DELETION_GRACE_DAYS;
    const deletionDueAt = new Date(
      now.getTime() + graceDays * 24 * 60 * 60 * 1000,
    );

    const hasLegalHold =
      await this.deps.accountDeletionRepository.hasActiveLegalHold(userId);

    const updated = await this.deps.accountDeletionRepository.markAsDeleted(
      userId,
      {
        deletedAt: now,
        deletionRequestedAt: now,
        deletionDueAt,
      },
    );
    if (!updated?.deletionDueAt) {
      const schedule =
        await this.deps.accountDeletionRepository.findDeletionScheduleByUserId(
          userId,
        );
      if (schedule?.deletionDueAt) {
        return ok({
          status: "scheduled",
          deletionDueAt: schedule.deletionDueAt.toISOString(),
          alreadyDeleted: true,
        });
      }
      throw new ApiError(401, "unauthorized", "User not found or not active");
    }

    await this.deps.auditRepository.createAuditLog({
      actorUserId: userId,
      action: "account.deletion.requested",
      resourceType: "user",
      resourceId: userId,
      payload: {
        deletionDueAt: deletionDueAt.toISOString(),
        legalHoldActive: hasLegalHold,
        reauthMethod:
          hasPassword && hasMfaCode
            ? "password+mfa"
            : hasPassword
              ? "password"
              : "mfa",
      },
    });

    await this.deps.auditRepository.createSecurityEvent({
      eventType: "account.deletion.requested",
      userId,
      payload: {
        status: "scheduled",
      },
    });

    return ok({
      status: "scheduled",
      deletionDueAt: deletionDueAt.toISOString(),
      alreadyDeleted: false,
    });
  }

  async finalizeDueDeletions(now: Date = new Date()) {
    const chunkSize = this.deps.env.RETENTION_BATCH_CHUNK_SIZE;
    const usersToDelete =
      await this.deps.accountDeletionRepository.findDueDeletions(
        now,
        chunkSize,
      );

    const summary = {
      processed: 0,
      deleted: 0,
      deferredLegalHold: 0,
      failed: 0,
    };

    for (const user of usersToDelete) {
      summary.processed++;
      try {
        const hasLegalHold =
          await this.deps.accountDeletionRepository.hasActiveLegalHold(user.id);
        if (hasLegalHold) {
          summary.deferredLegalHold++;
          await this.deps.auditRepository.createAuditLog({
            actorUserId: null,
            action: "account.deletion.deferred_legal_hold",
            resourceType: "user",
            resourceId: user.id,
            payload: {
              reason: "Active legal hold",
            },
          });
          continue;
        }

        await this.deps.accountDeletionRepository.physicallyDeleteUser(user.id);
        summary.deleted++;

        await this.deps.auditRepository.createAuditLog({
          actorUserId: null,
          action: "account.deletion.finalized",
          resourceType: "user",
          resourceId: user.id,
          payload: {},
        });
      } catch (error) {
        this.deps.logger.error(
          { userId: user.id, error },
          "Failed to finalize account deletion",
        );
        summary.failed++;
      }
    }

    return summary;
  }
}
