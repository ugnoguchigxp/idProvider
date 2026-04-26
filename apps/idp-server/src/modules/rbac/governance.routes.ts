import { ApiError, emptyRequestSchema } from "@idp/shared";
import { Hono } from "hono";
import { authenticatedEndpointAdapter } from "../../adapters/authenticated-endpoint-adapter.js";
import type { AppEnv } from "../../config/env.js";
import type { AuditRepository } from "../audit/audit.repository.js";
import type { AuthService } from "../auth/auth.service.js";
import { assertAdminPermission } from "./admin-authorization.js";
import type { RBACService } from "./rbac.service.js";

export type GovernanceRoutesDependencies = {
  authService: AuthService;
  rbacService: RBACService;
  auditRepository: AuditRepository;
  env: AppEnv;
};

export const createGovernanceRoutes = (deps: GovernanceRoutesDependencies) => {
  const app = new Hono();
  const authenticate = deps.authService.authenticateAccessToken.bind(
    deps.authService,
  );

  app.get(
    "/v1/governance/permissions/me",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate,
      handler: async (_c, _payload, auth) => {
        const permissions = await deps.rbacService.getEffectivePermissions(
          auth.userId,
        );
        const snapshot = await deps.rbacService.getAuthorizationSnapshot(
          auth.userId,
        );
        return {
          userId: auth.userId,
          permissions,
          entitlements: snapshot.entitlements,
        };
      },
    }),
  );

  app.get(
    "/v1/admin/governance/access-snapshot",
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

        const rawLimit = Number(c.req.query("limit") ?? "100");
        if (!Number.isFinite(rawLimit) || rawLimit < 1 || rawLimit > 1000) {
          throw new ApiError(
            400,
            "validation_error",
            "limit must be a number between 1 and 1000",
          );
        }

        const users = await deps.rbacService.getAdminAccessSnapshot(rawLimit);
        return {
          generatedAt: new Date().toISOString(),
          count: users.length,
          users,
        };
      },
    }),
  );

  return app;
};
