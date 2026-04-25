import { randomUUID } from "node:crypto";
import { ApiError, ok } from "@idp/shared";
import { authenticator } from "otplib";
import type { MfaRepository } from "./mfa.repository.js";
import type { MfaRecoveryService } from "./mfa-recovery.service.js";

export type MfaServiceDependencies = {
  mfaRepository: MfaRepository;
  mfaRecoveryService?: MfaRecoveryService;
};

export class MfaService {
  constructor(private deps: MfaServiceDependencies) {}

  async enrollMfa(userId: string) {
    const secret = authenticator.generateSecret();
    const factorId = randomUUID();
    await this.deps.mfaRepository.create({
      userId,
      factorId,
      secret,
      type: "totp",
    });
    return ok({ factorId, secret });
  }

  async verifyMfa(
    userId: string,
    factorId: string,
    code: string,
    options: { issueRecoveryCodes?: boolean } = {},
  ) {
    const factor = await this.deps.mfaRepository.findByFactorId(factorId);
    if (!factor || factor.userId !== userId) {
      throw new ApiError(401, "invalid_mfa", "Invalid MFA factor");
    }
    if (factor.type !== "totp" || !factor.secret) {
      throw new ApiError(
        401,
        "invalid_mfa",
        "Invalid MFA factor for TOTP verification",
      );
    }
    const valid = authenticator.check(code, factor.secret);
    if (!valid) {
      throw new ApiError(401, "invalid_mfa", "Invalid MFA code");
    }

    if (options.issueRecoveryCodes !== false) {
      const generated =
        await this.deps.mfaRecoveryService?.generateCodesIfMissing(
          userId,
          "initial_mfa_setup",
        );
      if (generated?.ok && generated.value.recoveryCodes.length > 0) {
        return ok({
          status: "verified",
          recoveryCodes: generated.value.recoveryCodes,
        });
      }
    }
    return ok({ status: "verified", recoveryCodes: [] });
  }

  async hasEnabledMfa(userId: string) {
    const factors =
      await this.deps.mfaRepository.findActiveFactorsByUserId(userId);
    return factors.length > 0;
  }
}
