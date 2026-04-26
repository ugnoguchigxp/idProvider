import {
  ApiError,
  emptyRequestSchema,
  oauthClientCreateSchema,
  oauthClientRotateSecretSchema,
  oauthClientUpdateSchema,
} from "@idp/shared";
import { Hono } from "hono";
import { authenticatedEndpointAdapter } from "../../adapters/authenticated-endpoint-adapter.js";
import type { AppEnv } from "../../config/env.js";
import type { AuditRepository } from "../audit/audit.repository.js";
import type { AuthService } from "../auth/auth.service.js";
import { assertAdminPermission } from "../rbac/admin-authorization.js";
import type { RBACService } from "../rbac/rbac.service.js";
import type { OAuthClientService } from "./oauth-client.service.js";

export type OAuthClientAdminRoutesDependencies = {
  authService: AuthService;
  rbacService: RBACService;
  oauthClientService: OAuthClientService;
  auditRepository: AuditRepository;
  env: AppEnv;
};

export const createOAuthClientRoutes = (
  deps: OAuthClientAdminRoutesDependencies,
) => {
  const app = new Hono();

  const authenticate = deps.authService.authenticateAccessToken.bind(
    deps.authService,
  );

  app.get(
    "/v1/admin/oauth/clients",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate,
      handler: async (c, _payload, auth) => {
        await assertAdminPermission(deps, {
          userId: auth.userId,
          resource: "admin.oauth_client",
          action: "read",
          path: c.req.path,
          method: c.req.method,
        });
        const result = await deps.oauthClientService.listClients();
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  app.post(
    "/v1/admin/oauth/clients",
    authenticatedEndpointAdapter({
      schema: oauthClientCreateSchema,
      authenticate,
      handler: async (c, payload, auth) => {
        await assertAdminPermission(deps, {
          userId: auth.userId,
          resource: "admin.oauth_client",
          action: "write",
          path: c.req.path,
          method: c.req.method,
        });
        const createInput = {
          name: payload.name,
          clientType: payload.clientType,
          tokenEndpointAuthMethod: payload.tokenEndpointAuthMethod,
          redirectUris: payload.redirectUris,
          allowedScopes: payload.allowedScopes,
          ...(payload.clientId ? { clientId: payload.clientId } : {}),
          ...(payload.accessTokenTtlSeconds !== undefined
            ? { accessTokenTtlSeconds: payload.accessTokenTtlSeconds }
            : {}),
          ...(payload.refreshTokenTtlSeconds !== undefined
            ? { refreshTokenTtlSeconds: payload.refreshTokenTtlSeconds }
            : {}),
        };
        const result = await deps.oauthClientService.createClient(
          auth.userId,
          createInput,
        );
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  app.put(
    "/v1/admin/oauth/clients/:clientId",
    authenticatedEndpointAdapter({
      schema: oauthClientUpdateSchema,
      authenticate,
      handler: async (c, payload, auth) => {
        await assertAdminPermission(deps, {
          userId: auth.userId,
          resource: "admin.oauth_client",
          action: "write",
          path: c.req.path,
          method: c.req.method,
        });
        const clientId = c.req.param("clientId");
        if (!clientId) {
          throw new ApiError(400, "invalid_request", "clientId is required");
        }
        const updateInput = {
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...(payload.status !== undefined ? { status: payload.status } : {}),
          ...(payload.redirectUris !== undefined
            ? { redirectUris: payload.redirectUris }
            : {}),
          ...(payload.allowedScopes !== undefined
            ? { allowedScopes: payload.allowedScopes }
            : {}),
          ...(payload.accessTokenTtlSeconds !== undefined
            ? { accessTokenTtlSeconds: payload.accessTokenTtlSeconds }
            : {}),
          ...(payload.refreshTokenTtlSeconds !== undefined
            ? { refreshTokenTtlSeconds: payload.refreshTokenTtlSeconds }
            : {}),
        };
        const result = await deps.oauthClientService.updateClient(
          auth.userId,
          clientId,
          updateInput,
        );
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  app.post(
    "/v1/admin/oauth/clients/:clientId/rotate-secret",
    authenticatedEndpointAdapter({
      schema: oauthClientRotateSecretSchema,
      authenticate,
      handler: async (c, payload, auth) => {
        await assertAdminPermission(deps, {
          userId: auth.userId,
          resource: "admin.oauth_client",
          action: "write",
          path: c.req.path,
          method: c.req.method,
        });
        const clientId = c.req.param("clientId");
        if (!clientId) {
          throw new ApiError(400, "invalid_request", "clientId is required");
        }
        const result = await deps.oauthClientService.rotateSecret(
          auth.userId,
          clientId,
          payload.gracePeriodDays,
        );
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  app.post(
    "/v1/admin/oauth/clients/:clientId/disable",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate,
      handler: async (c, _payload, auth) => {
        await assertAdminPermission(deps, {
          userId: auth.userId,
          resource: "admin.oauth_client",
          action: "write",
          path: c.req.path,
          method: c.req.method,
        });
        const clientId = c.req.param("clientId");
        if (!clientId) {
          throw new ApiError(400, "invalid_request", "clientId is required");
        }
        const result = await deps.oauthClientService.updateClient(
          auth.userId,
          clientId,
          { status: "disabled" },
        );
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  app.post(
    "/v1/admin/oauth/clients/:clientId/enable",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate,
      handler: async (c, _payload, auth) => {
        await assertAdminPermission(deps, {
          userId: auth.userId,
          resource: "admin.oauth_client",
          action: "write",
          path: c.req.path,
          method: c.req.method,
        });
        const clientId = c.req.param("clientId");
        if (!clientId) {
          throw new ApiError(400, "invalid_request", "clientId is required");
        }
        const result = await deps.oauthClientService.updateClient(
          auth.userId,
          clientId,
          { status: "active" },
        );
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  return app;
};
