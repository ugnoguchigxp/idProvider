import { createHash, randomUUID } from "node:crypto";
import type { AuditRepository } from "./audit.repository.js";

const EXPORT_PAGE_SIZE = 200;
const EXPORT_MAX_RECORDS = 10_000;

export type AuditExportKind = "audit_logs" | "security_events" | "both";

export type CreateAuditExportInput = {
  from?: Date | undefined;
  to?: Date | undefined;
  kind: AuditExportKind;
};

const toJsonLine = (record: Record<string, unknown>): string =>
  `${JSON.stringify(record)}\n`;

export class AuditExportService {
  constructor(private readonly auditRepository: AuditRepository) {}

  private async collectAuditLogs(from?: Date, to?: Date) {
    const records: Array<Record<string, unknown>> = [];
    let cursor:
      | {
          createdAt: Date;
          id: string;
        }
      | undefined;

    while (records.length < EXPORT_MAX_RECORDS) {
      const page = await this.auditRepository.listAuditLogs({
        from,
        to,
        limit: EXPORT_PAGE_SIZE,
        cursor,
      });

      for (const row of page.items) {
        records.push({
          kind: "audit_log",
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          actorUserId: row.actorUserId,
          action: row.action,
          resourceType: row.resourceType,
          resourceId: row.resourceId,
          payload: row.payload,
          prevHash: row.prevHash,
          entryHash: row.entryHash,
          integrityVersion: row.integrityVersion,
        });
      }

      if (!page.nextCursor || page.items.length === 0) {
        break;
      }
      cursor = page.nextCursor;
    }

    return records;
  }

  private async collectSecurityEvents(from?: Date, to?: Date) {
    const records: Array<Record<string, unknown>> = [];
    let cursor:
      | {
          createdAt: Date;
          id: string;
        }
      | undefined;

    while (records.length < EXPORT_MAX_RECORDS) {
      const page = await this.auditRepository.listSecurityEvents({
        from,
        to,
        limit: EXPORT_PAGE_SIZE,
        cursor,
      });

      for (const row of page.items) {
        records.push({
          kind: "security_event",
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          userId: row.userId,
          eventType: row.eventType,
          payload: row.payload,
        });
      }

      if (!page.nextCursor || page.items.length === 0) {
        break;
      }
      cursor = page.nextCursor;
    }

    return records;
  }

  async createExport(input: CreateAuditExportInput) {
    const records: Array<Record<string, unknown>> = [];

    if (input.kind === "audit_logs" || input.kind === "both") {
      records.push(...(await this.collectAuditLogs(input.from, input.to)));
    }

    if (input.kind === "security_events" || input.kind === "both") {
      records.push(...(await this.collectSecurityEvents(input.from, input.to)));
    }

    records.sort((left, right) => {
      const leftAt = String(left.createdAt ?? "");
      const rightAt = String(right.createdAt ?? "");
      if (leftAt !== rightAt) {
        return leftAt.localeCompare(rightAt);
      }
      return String(left.id ?? "").localeCompare(String(right.id ?? ""));
    });

    const jsonl = records.map((record) => toJsonLine(record)).join("");
    const sha256 = createHash("sha256").update(jsonl).digest("hex");

    return {
      exportId: randomUUID(),
      status: "completed" as const,
      manifest: {
        recordCount: records.length,
        sha256,
        generatedAt: new Date().toISOString(),
      },
      format: "jsonl" as const,
      data: jsonl,
      truncated: records.length >= EXPORT_MAX_RECORDS,
    };
  }
}
