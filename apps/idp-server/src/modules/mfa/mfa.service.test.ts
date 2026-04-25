import { ApiError } from "@idp/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MfaService } from "./mfa.service.js";

describe("MfaService", () => {
  let mfaService: MfaService;
  let deps: any;

  beforeEach(() => {
    deps = {
      mfaRepository: {
        create: vi.fn(),
        findByFactorId: vi.fn(),
        findActiveFactorsByUserId: vi.fn().mockResolvedValue([]),
      },
      mfaRecoveryService: {
        generateCodesIfMissing: vi
          .fn()
          .mockResolvedValue({ ok: true, value: { recoveryCodes: [] } }),
      },
      webauthnRepository: {},
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
    };
    mfaService = new MfaService(deps);
  });

  describe("enrollMfa", () => {
    it("should generate a factor and enroll it", async () => {
      const result = await mfaService.enrollMfa("u1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.factorId).toBeDefined();
        expect(result.value.secret).toBe("dummy-secret");
      }
      expect(deps.mfaRepository.create).toHaveBeenCalled();
    });
  });

  describe("verifyMfa", () => {
    it("should successfully verify mfa if factor belongs to user", async () => {
      deps.mfaRepository.findByFactorId.mockResolvedValue({
        id: "f1",
        userId: "u1",
        type: "totp",
        enabled: true,
      });

      const result = await mfaService.verifyMfa("u1", "f1", "123456");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe("verified");
      }
    });

    it("should return recovery codes on first verification", async () => {
      deps.mfaRepository.findByFactorId.mockResolvedValue({
        id: "f1",
        userId: "u1",
        type: "totp",
        enabled: true,
      });
      deps.mfaRecoveryService.generateCodesIfMissing.mockResolvedValueOnce({
        ok: true,
        value: { recoveryCodes: ["ABCDE-FGHJK-LMNPQ-RSTUV"] },
      });

      const result = await mfaService.verifyMfa("u1", "f1", "123456");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.recoveryCodes).toEqual(["ABCDE-FGHJK-LMNPQ-RSTUV"]);
      }
    });

    it("should throw error if factor does not belong to user", async () => {
      deps.mfaRepository.findByFactorId.mockResolvedValue({
        id: "f1",
        userId: "other",
        type: "totp",
      });

      await expect(mfaService.verifyMfa("u1", "f1", "123456")).rejects.toThrow(
        ApiError,
      );
    });
  });
});
