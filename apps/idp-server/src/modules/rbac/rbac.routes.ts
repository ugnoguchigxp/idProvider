import {
  ApiError,
  authCheckRequestSchema,
  entitlementCheckRequestSchema,
} from "@idp/shared";
import { Hono } from "hono";
import { authenticatedEndpointAdapter } from "../../adapters/authenticated-endpoint-adapter.js";
import type { AuthService } from "../auth/auth.service.js";
import type { RBACService } from "./rbac.service.js";

export type RbacRoutesDependencies = {
  authService: AuthService;
  rbacService: RBACService;
};

export const createRbacRoutes = (deps: RbacRoutesDependencies) => {
  const app = new Hono();

  const authenticate = deps.authService.authenticateAccessToken.bind(
    deps.authService,
  );

  const resolveSubject = async (actorUserId: string, subject?: string) => {
    if (!subject || subject === actorUserId) {
      return actorUserId;
    }

    const adminCheck = await deps.rbacService.authorizationCheck({
      userId: actorUserId,
      action: "manage",
      resource: "admin",
    });
    if (!adminCheck.allowed) {
      throw new ApiError(403, "forbidden", "Admin privilege is required");
    }
    return subject;
  };

  app.post(
    "/v1/authorization/check",
    authenticatedEndpointAdapter({
      schema: authCheckRequestSchema,
      authenticate,
      handler: async (_c, payload, auth) => {
        const userId = await resolveSubject(auth.userId, payload.subject);
        return deps.rbacService.authorizationCheck({
          userId,
          action: payload.action,
          resource: payload.resource,
          ...(payload.organizationId
            ? { organizationId: payload.organizationId }
            : {}),
          ...(payload.groupId ? { groupId: payload.groupId } : {}),
        });
      },
    }),
  );

  app.post(
    "/v1/entitlements/check",
    authenticatedEndpointAdapter({
      schema: entitlementCheckRequestSchema,
      authenticate,
      handler: async (_c, payload, auth) => {
        return deps.rbacService.entitlementCheck({
          userId: auth.userId,
          key: payload.key,
          ...(payload.organizationId
            ? { organizationId: payload.organizationId }
            : {}),
          ...(payload.groupId ? { groupId: payload.groupId } : {}),
          ...(typeof payload.quantity === "number"
            ? { quantity: payload.quantity }
            : {}),
        });
      },
    }),
  );

  return app;
};
