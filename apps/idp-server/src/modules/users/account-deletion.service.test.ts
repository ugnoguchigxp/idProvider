import { type ApiError, ok } from "@idp/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as passwordModule from "../../core/password.js";
import { AccountDeletionService } from "./account-deletion.service.js";

describe("AccountDeletionService", () => {
  let service: AccountDeletionService;
  let deps: any;

  beforeEach(() => {
    deps = {
      accountDeletionRepository: {
        findDeletionScheduleByUserId: vi.fn(),
        markAsDeleted: vi.fn().mockResolvedValue({
          deletionDueAt: new Date("2026-05-25T00:00:00.000Z"),
        }),
        findDueDeletions: vi.fn().mockResolvedValue([]),
        hasActiveLegalHold: vi.fn().mockResolvedValue(false),
        physicallyDeleteUser: vi.fn().mockResolvedValue(undefined),
      },
      userRepository: {
        findById: vi.fn(),
        findWithPasswordById: vi.fn(),
      },
      mfaService: {
        verifyMfa: vi.fn().mockResolvedValue(ok({ status: "verified" })),
      },
      auditRepository: {
        createAuditLog: vi.fn().mockResolvedValue(undefined),
        createSecurityEvent: vi.fn().mockResolvedValue(undefined),
      },
      env: {
        ACCOUNT_DELETION_GRACE_DAYS: 30,
        RETENTION_BATCH_CHUNK_SIZE: 100,
      },
      logger: { info: vi.fn(), error: vi.fn() },
    };
    service = new AccountDeletionService(deps);
  });

  describe("requestDeletion", () => {
    it("should mark user as deleted if password is correct", async () => {
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        status: "active",
      });
      deps.userRepository.findWithPasswordById.mockResolvedValue({
        id: "u1",
        passwordHash: "hashed",
      });
      vi.spyOn(passwordModule, "verifyPassword").mockResolvedValueOnce(true);

      const result = await service.requestDeletion("u1", {
        currentPassword: "password",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.alreadyDeleted).toBe(false);
      }
      expect(deps.accountDeletionRepository.markAsDeleted).toHaveBeenCalled();
    });

    it("should reject when reauth payload is missing", async () => {
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        status: "active",
      });

      await expect(service.requestDeletion("u1", {})).rejects.toMatchObject({
        status: 400,
        code: "reauth_required",
      } satisfies Partial<ApiError>);
    });

    it("should return existing deletion info if already deleted (idempotent)", async () => {
      const dueAt = new Date();
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        status: "deleted",
      });
      deps.accountDeletionRepository.findDeletionScheduleByUserId.mockResolvedValue(
        {
          id: "u1",
          deletionDueAt: dueAt,
        },
      );

      const result = await service.requestDeletion("u1", {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.deletionDueAt).toBe(dueAt.toISOString());
        expect(result.value.alreadyDeleted).toBe(true);
      }
      expect(
        deps.accountDeletionRepository.markAsDeleted,
      ).not.toHaveBeenCalled();
    });

    it("should not write duplicate audit events when another request deleted the user first", async () => {
      const dueAt = new Date("2026-05-25T00:00:00.000Z");
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        status: "active",
      });
      deps.userRepository.findWithPasswordById.mockResolvedValue({
        id: "u1",
        passwordHash: "hashed",
      });
      vi.spyOn(passwordModule, "verifyPassword").mockResolvedValueOnce(true);
      deps.accountDeletionRepository.markAsDeleted.mockResolvedValueOnce(null);
      deps.accountDeletionRepository.findDeletionScheduleByUserId.mockResolvedValueOnce(
        {
          deletionDueAt: dueAt,
        },
      );

      const result = await service.requestDeletion("u1", {
        currentPassword: "password",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.alreadyDeleted).toBe(true);
        expect(result.value.deletionDueAt).toBe(dueAt.toISOString());
      }
      expect(deps.auditRepository.createAuditLog).not.toHaveBeenCalled();
      expect(deps.auditRepository.createSecurityEvent).not.toHaveBeenCalled();
    });

    it("should preserve unexpected MFA failures", async () => {
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        status: "active",
      });
      deps.mfaService.verifyMfa.mockRejectedValueOnce(
        new Error("database unavailable"),
      );

      await expect(
        service.requestDeletion("u1", {
          mfaCode: "123456",
          mfaFactorId: "00000000-0000-0000-0000-000000000000",
        }),
      ).rejects.toThrow("database unavailable");
    });

    it("should throw if user is deleted but schedule is not found", async () => {
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        status: "deleted",
      });
      deps.accountDeletionRepository.findDeletionScheduleByUserId.mockResolvedValue(
        null,
      );

      await expect(
        service.requestDeletion("u1", {
          currentPassword: "password",
        }),
      ).rejects.toMatchObject({ status: 401 });
    });

    it("should mark user as deleted if MFA is correct", async () => {
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        status: "active",
      });
      deps.mfaService.verifyMfa.mockResolvedValueOnce({ ok: true });

      const result = await service.requestDeletion("u1", {
        mfaCode: "123456",
        mfaFactorId: "fid",
      });
      expect(result.ok).toBe(true);
      expect(deps.accountDeletionRepository.markAsDeleted).toHaveBeenCalled();
    });

    it("should throw if password is invalid", async () => {
      deps.userRepository.findById.mockResolvedValue({
        id: "u1",
        status: "active",
      });
      deps.userRepository.findWithPasswordById.mockResolvedValue({
        id: "u1",
        passwordHash: "hashed",
      });
      vi.spyOn(passwordModule, "verifyPassword").mockResolvedValueOnce(false);

      await expect(
        service.requestDeletion("u1", {
          currentPassword: "wrong",
        }),
      ).rejects.toMatchObject({ status: 401 });
    });
  });

  describe("finalizeDueDeletions", () => {
    it("should delete users whose grace period has expired", async () => {
      deps.accountDeletionRepository.findDueDeletions.mockResolvedValue([
        { id: "u1" },
        { id: "u2" },
      ]);
      deps.accountDeletionRepository.hasActiveLegalHold.mockResolvedValue(
        false,
      );

      const summary = await service.finalizeDueDeletions();
      expect(summary.processed).toBe(2);
      expect(summary.deleted).toBe(2);
      expect(
        deps.accountDeletionRepository.physicallyDeleteUser,
      ).toHaveBeenCalledTimes(2);
    });

    it("should skip users with active legal hold", async () => {
      deps.accountDeletionRepository.findDueDeletions.mockResolvedValue([
        { id: "u1" },
      ]);
      deps.accountDeletionRepository.hasActiveLegalHold.mockResolvedValue(true);

      const summary = await service.finalizeDueDeletions();
      expect(summary.processed).toBe(1);
      expect(summary.deleted).toBe(0);
      expect(summary.deferredLegalHold).toBe(1);
      expect(
        deps.accountDeletionRepository.physicallyDeleteUser,
      ).not.toHaveBeenCalled();
    });

    it("should increment failed count if physicallyDeleteUser throws", async () => {
      deps.accountDeletionRepository.findDueDeletions.mockResolvedValue([
        { id: "u1" },
      ]);
      deps.accountDeletionRepository.hasActiveLegalHold.mockResolvedValue(
        false,
      );
      deps.accountDeletionRepository.physicallyDeleteUser.mockRejectedValue(
        new Error("db error"),
      );

      const summary = await service.finalizeDueDeletions();
      expect(summary.processed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.deleted).toBe(0);
      expect(deps.logger.error).toHaveBeenCalled();
    });
  });
});
