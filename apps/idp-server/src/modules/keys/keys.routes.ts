import type { KeyStoreService } from "@idp/auth-core";
import { emptyRequestSchema } from "@idp/shared";
import { Hono } from "hono";
import { authenticatedEndpointAdapter } from "../../adapters/authenticated-endpoint-adapter.js";
import type { AppEnv } from "../../config/env.js";
import type { AuditRepository } from "../audit/audit.repository.js";
import type { AuthService } from "../auth/auth.service.js";
import { assertAdminPermission } from "../rbac/admin-authorization.js";
import type { RBACService } from "../rbac/rbac.service.js";

export type KeyManagementRoutesDependencies = {
  authService: AuthService;
  rbacService: RBACService;
  keyStore: KeyStoreService;
  auditRepository: AuditRepository;
  env: AppEnv;
};

export const createKeyManagementRoutes = (
  deps: KeyManagementRoutesDependencies,
) => {
  const app = new Hono();

  const authenticate = deps.authService.authenticateAccessToken.bind(
    deps.authService,
  );

  app.get(
    "/v1/admin/keys",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate,
      handler: async (c, _payload, auth) => {
        await assertAdminPermission(deps, {
          userId: auth.userId,
          resource: "admin.keys",
          action: "read",
          path: c.req.path,
          method: c.req.method,
        });
        const keys = await deps.keyStore.listKeys();
        return { keys };
      },
    }),
  );

  app.post(
    "/v1/admin/keys/rotate",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate,
      handler: async (c, _payload, auth) => {
        await assertAdminPermission(deps, {
          userId: auth.userId,
          resource: "admin.keys",
          action: "rotate",
          path: c.req.path,
          method: c.req.method,
        });
        const result = await deps.keyStore.rotateManual(auth.userId);
        const previousKid = "previousKid" in result ? result.previousKid : null;
        await deps.auditRepository.createSecurityEvent({
          eventType: "key.rotation.manual",
          userId: auth.userId,
          payload: {
            rotated: result.rotated,
            activeKid: result.activeKid,
            previousKid,
          },
        });
        return {
          status: result.rotated ? "rotated" : "noop",
          activeKid: result.activeKid,
          previousKid,
          reason: result.reason,
        };
      },
    }),
  );

  app.post(
    "/v1/admin/keys/rotate-emergency",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate,
      handler: async (c, _payload, auth) => {
        await assertAdminPermission(deps, {
          userId: auth.userId,
          resource: "admin.keys",
          action: "rotate",
          path: c.req.path,
          method: c.req.method,
        });
        const result = await deps.keyStore.rotateEmergency(auth.userId);
        const previousKid = "previousKid" in result ? result.previousKid : null;
        if (previousKid) {
          await deps.auditRepository.createSecurityEvent({
            eventType: "key.revoked",
            userId: auth.userId,
            payload: {
              kid: previousKid,
              reason: "emergency_rotation",
            },
          });
        }
        await deps.auditRepository.createSecurityEvent({
          eventType: "key.rotation.emergency",
          userId: auth.userId,
          payload: {
            rotated: result.rotated,
            activeKid: result.activeKid,
            previousKid,
          },
        });
        return {
          status: result.rotated ? "rotated" : "noop",
          activeKid: result.activeKid,
          previousKid,
          reason: result.reason,
        };
      },
    }),
  );

  return app;
};
