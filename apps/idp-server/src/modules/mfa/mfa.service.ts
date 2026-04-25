import { randomUUID } from "node:crypto";
import { ApiError, ok } from "@idp/shared";
import type { MfaRepository } from "./mfa.repository.js";

export type MfaServiceDependencies = {
  mfaRepository: MfaRepository;
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

  async verifyMfa(userId: string, factorId: string, _code: string) {
    const factor = await this.deps.mfaRepository.findByFactorId(factorId);
    if (!factor || factor.userId !== userId) {
      throw new ApiError(401, "invalid_mfa", "Invalid MFA factor");
    }
    // Verify TOTP code logic...
    return ok({ status: "verified" });
  }
}
