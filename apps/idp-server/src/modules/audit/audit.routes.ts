import { ApiError, emptyRequestSchema } from "@idp/shared";
import { Hono } from "hono";
import { z } from "zod";
import { authenticatedEndpointAdapter } from "../../adapters/authenticated-endpoint-adapter.js";
import type { AppEnv } from "../../config/env.js";
import type { AuthService } from "../auth/auth.service.js";
import { assertAdminPermission } from "../rbac/admin-authorization.js";
import type { RBACService } from "../rbac/rbac.service.js";
import type { AuditRepository } from "./audit.repository.js";
import { AuditExportService } from "./audit-export.service.js";

export type AuditRoutesDependencies = {
  authService: AuthService;
  rbacService: RBACService;
  auditRepository: AuditRepository;
  env: AppEnv;
};

const auditExportRequestSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  kind: z.enum(["audit_logs", "security_events", "both"]),
  format: z.literal("jsonl").default("jsonl"),
});

const parseDate = (
  value: string | undefined,
  field: string,
): Date | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, "validation_error", `Invalid ${field}`);
  }
  return parsed;
};

const decodeCursor = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }
  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as { createdAt: string; id: string };
    const createdAt = new Date(decoded.createdAt);
    if (Number.isNaN(createdAt.getTime()) || typeof decoded.id !== "string") {
      throw new Error("invalid cursor");
    }
    return {
      createdAt,
      id: decoded.id,
    };
  } catch {
    throw new ApiError(400, "validation_error", "Invalid cursor");
  }
};

const encodeCursor = (
  value: {
    createdAt: Date;
    id: string;
  } | null,
) => {
  if (!value) {
    return null;
  }
  return Buffer.from(
    JSON.stringify({
      createdAt: value.createdAt.toISOString(),
      id: value.id,
    }),
  ).toString("base64url");
};

export const createAuditRoutes = (deps: AuditRoutesDependencies) => {
  const app = new Hono();
  const auditExportService = new AuditExportService(deps.auditRepository);

  const authenticate = deps.authService.authenticateAccessToken.bind(
    deps.authService,
  );

  app.get(
    "/v1/admin/audit/logs",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate,
      handler: async (c, _payload, auth) => {
        await assertAdminPermission(deps, {
          userId: auth.userId,
          resource: "admin.audit",
          action: "read",
          path: c.req.path,
          method: c.req.method,
        });
        const query = c.req.query();
        const page = await deps.auditRepository.listAuditLogs({
          from: parseDate(query.from, "from"),
          to: parseDate(query.to, "to"),
          actorUserId: query.actorUserId,
          action: query.action,
          resourceType: query.resourceType,
          resourceId: query.resourceId,
          limit: Number(query.limit ?? 50),
          cursor: decodeCursor(query.cursor),
        });

        return {
          logs: page.items.map((row) => ({
            ...row,
            createdAt: row.createdAt.toISOString(),
          })),
          nextCursor: encodeCursor(page.nextCursor),
        };
      },
    }),
  );

  app.get(
    "/v1/admin/audit/security-events",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate,
      handler: async (c, _payload, auth) => {
        await assertAdminPermission(deps, {
          userId: auth.userId,
          resource: "admin.audit",
          action: "read",
          path: c.req.path,
          method: c.req.method,
        });
        const query = c.req.query();
        const page = await deps.auditRepository.listSecurityEvents({
          from: parseDate(query.from, "from"),
          to: parseDate(query.to, "to"),
          userId: query.userId,
          eventType: query.eventType,
          limit: Number(query.limit ?? 50),
          cursor: decodeCursor(query.cursor),
        });

        return {
          events: page.items.map((row) => ({
            ...row,
            createdAt: row.createdAt.toISOString(),
          })),
          nextCursor: encodeCursor(page.nextCursor),
        };
      },
    }),
  );

  app.get(
    "/v1/admin/audit/integrity",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate,
      handler: async (c, _payload, auth) => {
        await assertAdminPermission(deps, {
          userId: auth.userId,
          resource: "admin.audit",
          action: "read",
          path: c.req.path,
          method: c.req.method,
        });
        const query = c.req.query();
        return deps.auditRepository.verifyIntegrityRange({
          from: parseDate(query.from, "from"),
          to: parseDate(query.to, "to"),
        });
      },
    }),
  );

  app.post(
    "/v1/admin/audit/exports",
    authenticatedEndpointAdapter({
      schema: auditExportRequestSchema,
      authenticate,
      handler: async (c, payload, auth) => {
        await assertAdminPermission(deps, {
          userId: auth.userId,
          resource: "admin.audit",
          action: "export",
          path: c.req.path,
          method: c.req.method,
        });

        const from = payload.from ? new Date(payload.from) : undefined;
        const to = payload.to ? new Date(payload.to) : undefined;
        if (from && to && from > to) {
          throw new ApiError(400, "validation_error", "from must be <= to");
        }

        const result = await auditExportService.createExport({
          from,
          to,
          kind: payload.kind,
        });

        await deps.auditRepository.createSecurityEvent({
          eventType: "audit.export.generated",
          userId: auth.userId,
          payload: {
            exportId: result.exportId,
            kind: payload.kind,
            recordCount: result.manifest.recordCount,
            sha256: result.manifest.sha256,
          },
        });

        await deps.auditRepository.createAuditLog({
          actorUserId: auth.userId,
          action: "admin.audit.export.create",
          resourceType: "audit_export",
          resourceId: result.exportId,
          payload: {
            kind: payload.kind,
            recordCount: result.manifest.recordCount,
            sha256: result.manifest.sha256,
          },
        });

        return result;
      },
    }),
  );

  return app;
};
