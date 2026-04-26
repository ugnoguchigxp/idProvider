import { describe, expect, it, vi } from "vitest";
import { AuditExportService } from "./audit-export.service.js";

describe("AuditExportService", () => {
  it("generates deterministic manifest hash for same input", async () => {
    const repository = {
      listAuditLogs: vi.fn().mockResolvedValue({
        items: [
          {
            id: "a-1",
            actorUserId: "u1",
            action: "admin.config.updated",
            resourceType: "config",
            resourceId: "social_login.google",
            payload: { key: "social_login.google" },
            prevHash: null,
            entryHash: "h1",
            integrityVersion: 1,
            createdAt: new Date("2026-04-26T00:00:00.000Z"),
          },
        ],
        nextCursor: null,
      }),
      listSecurityEvents: vi.fn().mockResolvedValue({
        items: [
          {
            id: "s-1",
            userId: "u1",
            eventType: "login.success",
            payload: { method: "password" },
            createdAt: new Date("2026-04-26T00:10:00.000Z"),
          },
        ],
        nextCursor: null,
      }),
    } as any;

    const service = new AuditExportService(repository);

    const first = await service.createExport({ kind: "both" });
    const second = await service.createExport({ kind: "both" });

    expect(first.manifest.sha256).toBe(second.manifest.sha256);
    expect(first.manifest.recordCount).toBe(2);
    expect(first.format).toBe("jsonl");
    expect(first.data.length).toBeGreaterThan(0);
  });
});
