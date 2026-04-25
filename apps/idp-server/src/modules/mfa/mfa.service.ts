import { randomUUID } from "node:crypto";
import { ApiError, ok } from "@idp/shared";
import type { MfaRepository } from "./mfa.repository.js";
import type { MfaRecoveryService } from "./mfa-recovery.service.js";

export type MfaServiceDependencies = {
  mfaRepository: MfaRepository;
  mfaRecoveryService?: MfaRecoveryService;
};

export class MfaService {
  constructor(private deps: MfaServiceDependencies) {}

  async enrollMfa(userId: string) {
    const secret = "dummy-secret"; // Generate real secret
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
    _code: string,
    options: { issueRecoveryCodes?: boolean } = {},
  ) {
    const factor = await this.deps.mfaRepository.findByFactorId(factorId);
    if (!factor || factor.userId !== userId) {
      throw new ApiError(401, "invalid_mfa", "Invalid MFA factor");
    }
    // Verify TOTP code logic...
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
