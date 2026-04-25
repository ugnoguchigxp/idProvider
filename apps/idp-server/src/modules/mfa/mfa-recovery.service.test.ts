import type { ApiError } from "@idp/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MfaRecoveryService } from "./mfa-recovery.service.js";

describe("MfaRecoveryService", () => {
  let service: MfaRecoveryService;
  let deps: any;
  const env = {
    MFA_RECOVERY_CODE_PEPPER: "test-pepper-value",
    MFA_RECOVERY_CODE_COUNT: 3,
    MFA_RECOVERY_CODE_LENGTH: 20,
  };

  beforeEach(() => {
    deps = {
      mfaRecoveryRepository: {
        createBatch: vi.fn(),
        countActiveByUserId: vi.fn().mockResolvedValue(3),
        findActiveByLookupHash: vi.fn(),
        markUsed: vi.fn().mockResolvedValue(true),
      },
      auditRepository: {
        createAuditLog: vi.fn(),
        createSecurityEvent: vi.fn(),
      },
      env,
      logger: { info: vi.fn(), error: vi.fn() },
    };
    service = new MfaRecoveryService(deps);
  });

  it("should generate plaintext codes and store only hashes", async () => {
    const result = await service.generateCodes("u1", "initial_mfa_setup");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.recoveryCodes).toHaveLength(3);
      expect(result.value.recoveryCodes[0]).toMatch(
        /^[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}$/,
      );
      const stored = deps.mfaRecoveryRepository.createBatch.mock.calls[0][2];
      expect(stored[0].lookupHash).toEqual(expect.any(String));
      expect(stored[0].codeHash).toMatch(/^\$argon2/);
      expect(stored[0]).not.toHaveProperty("code");
      expect(JSON.stringify(stored)).not.toContain(
        result.value.recoveryCodes[0],
      );
    }
  });

  it("should consume a valid recovery code once", async () => {
    const generated = await service.generateCodes("u1", "initial_mfa_setup");
    if (!generated.ok) throw new Error("expected generated codes");
    const stored = deps.mfaRecoveryRepository.createBatch.mock.calls[0][2][0];
    deps.mfaRecoveryRepository.findActiveByLookupHash.mockResolvedValue({
      id: "code-1",
      userId: "u1",
      codeHash: stored.codeHash,
    });
    deps.mfaRecoveryRepository.countActiveByUserId.mockResolvedValue(2);

    const result = await service.consumeCode(
      "u1",
      generated.value.recoveryCodes[0] as string,
    );

    expect(result.ok).toBe(true);
    expect(deps.mfaRecoveryRepository.markUsed).toHaveBeenCalledWith("code-1");
    expect(deps.auditRepository.createSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "mfa.recovery_codes.low",
        payload: { remainingCount: 2 },
      }),
    );
  });

  it("should reject invalid codes without leaking existence", async () => {
    deps.mfaRecoveryRepository.findActiveByLookupHash.mockResolvedValue(null);

    await expect(
      service.consumeCode("u1", "invalid-code"),
    ).rejects.toMatchObject({
      status: 401,
      code: "invalid_mfa_recovery_code",
    } satisfies Partial<ApiError>);
  });
});
