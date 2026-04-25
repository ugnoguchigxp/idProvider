import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { ApiError, ok } from "@idp/shared";
import argon2 from "argon2";
import type pino from "pino";
import type { AppEnv } from "../../config/env.js";
import type { AuditRepository } from "../audit/audit.repository.js";
import type { MfaRecoveryRepository } from "./mfa-recovery.repository.js";

const recoveryAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type MfaRecoveryServiceDependencies = {
  mfaRecoveryRepository: MfaRecoveryRepository;
  auditRepository: AuditRepository;
  env: AppEnv;
  logger: pino.Logger;
};

export class MfaRecoveryService {
  constructor(private deps: MfaRecoveryServiceDependencies) {}

  async generateCodes(
    userId: string,
    reason: "initial_mfa_setup" | "regenerated",
  ) {
    const batchId = randomUUID();
    const plainCodes = Array.from(
      { length: this.deps.env.MFA_RECOVERY_CODE_COUNT },
      () => this.generatePlainCode(),
    );
    const records = await Promise.all(
      plainCodes.map(async (code) => ({
        lookupHash: this.lookupHash(code),
        codeHash: await argon2.hash(this.normalizeCode(code)),
        lastChars: this.normalizeCode(code).slice(-8),
      })),
    );

    await this.deps.mfaRecoveryRepository.createBatch(userId, batchId, records);
    await this.deps.auditRepository.createAuditLog({
      actorUserId: userId,
      action: "mfa.recovery_codes.generated",
      resourceType: "user",
      resourceId: userId,
      payload: {
        batchId,
        count: records.length,
        reason,
      },
    });
    await this.deps.auditRepository.createSecurityEvent({
      eventType: "mfa.recovery_codes.generated",
      userId,
      payload: {
        batchId,
        count: records.length,
        reason,
      },
    });

    return ok({ batchId, recoveryCodes: plainCodes });
  }

  async generateCodesIfMissing(userId: string, reason: "initial_mfa_setup") {
    const count =
      await this.deps.mfaRecoveryRepository.countActiveByUserId(userId);
    if (count > 0) {
      return ok({ recoveryCodes: [] as string[] });
    }
    return this.generateCodes(userId, reason);
  }

  async regenerateCodes(userId: string) {
    await this.deps.auditRepository.createSecurityEvent({
      eventType: "mfa.recovery_codes.revoked",
      userId,
      payload: {
        reason: "regenerated",
      },
    });
    return this.generateCodes(userId, "regenerated");
  }

  async consumeCode(userId: string, code: string) {
    const normalizedCode = this.normalizeCode(code);
    const record = await this.deps.mfaRecoveryRepository.findActiveByLookupHash(
      this.lookupHash(normalizedCode),
    );
    const isValid =
      record?.userId === userId
        ? await argon2.verify(record.codeHash, normalizedCode)
        : false;
    if (!record || !isValid) {
      throw new ApiError(
        401,
        "invalid_mfa_recovery_code",
        "Invalid MFA recovery code",
      );
    }

    const used = await this.deps.mfaRecoveryRepository.markUsed(record.id);
    if (!used) {
      throw new ApiError(
        401,
        "invalid_mfa_recovery_code",
        "Invalid MFA recovery code",
      );
    }

    const remainingCount =
      await this.deps.mfaRecoveryRepository.countActiveByUserId(userId);
    await this.deps.auditRepository.createAuditLog({
      actorUserId: userId,
      action: "mfa.recovery_code.used",
      resourceType: "user",
      resourceId: userId,
      payload: {
        remainingCount,
      },
    });
    await this.deps.auditRepository.createSecurityEvent({
      eventType: "mfa.recovery_code.used",
      userId,
      payload: {
        remainingCount,
      },
    });

    if (remainingCount <= 2) {
      await this.deps.auditRepository.createSecurityEvent({
        eventType: "mfa.recovery_codes.low",
        userId,
        payload: {
          remainingCount,
        },
      });
    }

    return ok({ status: "verified", remainingCount });
  }

  normalizeCode(code: string) {
    return code.replace(/[\s-]/g, "").toUpperCase();
  }

  private lookupHash(code: string) {
    return createHmac("sha256", this.deps.env.MFA_RECOVERY_CODE_PEPPER)
      .update(this.normalizeCode(code))
      .digest("hex");
  }

  private generatePlainCode() {
    const length = this.deps.env.MFA_RECOVERY_CODE_LENGTH;
    let raw = "";
    while (raw.length < length) {
      const byte = randomBytes(1)[0] ?? 0;
      if (byte >= recoveryAlphabet.length * 7) {
        continue;
      }
      raw += recoveryAlphabet[byte % recoveryAlphabet.length];
    }
    return raw.match(/.{1,5}/g)?.join("-") ?? raw;
  }
}
