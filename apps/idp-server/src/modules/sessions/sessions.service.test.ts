import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionService } from "./sessions.service.js";

describe("SessionService", () => {
  let sessionService: SessionService;
  let deps: any;

  beforeEach(() => {
    deps = {
      sessionRepository: {
        findAllByUserId: vi.fn(),
        revoke: vi.fn(),
        revokeAllByUserId: vi.fn(),
        findById: vi.fn(),
      },
      logger: {
        info: vi.fn(),
        error: vi.fn(),
      },
    };
    sessionService = new SessionService(deps);
  });

  describe("listSessions", () => {
    it("should list all sessions for a user", async () => {
      const mockSessions = [
        {
          id: "s1",
          ipAddress: "1.1.1.1",
          userAgent: "UA1",
          createdAt: new Date(),
        },
      ];
      deps.sessionRepository.findAllByUserId.mockResolvedValue(mockSessions);

      const result = await sessionService.listSessions("u1");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        if (result.value[0]) {
          expect(result.value[0].id).toBe("s1");
        }
      }
    });
  });

  describe("revokeSession", () => {
    it("should revoke a session if it belongs to the user", async () => {
      deps.sessionRepository.findById.mockResolvedValue({
        id: "s1",
        userId: "u1",
      });

      const result = await sessionService.revokeSession("u1", "s1");
      expect(result.ok).toBe(true);
      expect(deps.sessionRepository.revoke).toHaveBeenCalledWith("s1");
    });

    it("should not revoke a session if it does not belong to the user", async () => {
      deps.sessionRepository.findById.mockResolvedValue({
        id: "s1",
        userId: "other",
      });

      const result = await sessionService.revokeSession("u1", "s1");
      expect(result.ok).toBe(true);
      expect(deps.sessionRepository.revoke).not.toHaveBeenCalled();
    });
  });

  describe("revokeAllSessions", () => {
    it("should revoke all sessions for a user", async () => {
      const result = await sessionService.revokeAllSessions("u1");
      expect(result.ok).toBe(true);
      expect(deps.sessionRepository.revokeAllByUserId).toHaveBeenCalledWith(
        "u1",
      );
    });
  });
});
