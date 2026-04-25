import {
  ApiError,
  authCheckRequestSchema,
  emptyRequestSchema,
  entitlementCheckRequestSchema,
  googleLinkRequestSchema,
  googleUnlinkRequestSchema,
  mfaEnrollRequestSchema,
  mfaVerifyRequestSchema,
  passwordChangeRequestSchema,
  revokeSessionRequestSchema,
} from "@idp/shared";
import { Hono } from "hono";
import { authenticatedEndpointAdapter } from "../adapters/authenticated-endpoint-adapter.js";
import type { AppDependencies } from "../core/app-context.js";

export const buildAuthenticatedRoutes = (deps: AppDependencies) => {
  const app = new Hono();

  app.get(
    "/v1/me",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate: deps.authService.authenticateAccessToken.bind(
        deps.authService,
      ),
      handler: async (_c, _payload, auth) =>
        deps.authService.getMe(auth.userId),
    }),
  );

  app.post(
    "/v1/logout",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate: deps.authService.authenticateAccessToken.bind(
        deps.authService,
      ),
      handler: async (_c, _payload, auth) => {
        await deps.authService.logoutBySession(auth.sessionId, auth.userId);
        return {
          status: "ok",
        };
      },
    }),
  );

  app.post(
    "/v1/mfa/enroll",
    authenticatedEndpointAdapter({
      schema: mfaEnrollRequestSchema,
      authenticate: deps.authService.authenticateAccessToken.bind(
        deps.authService,
      ),
      handler: async (_c, _payload, auth) =>
        deps.authService.enrollMfa(auth.userId),
    }),
  );

  app.post(
    "/v1/mfa/verify",
    authenticatedEndpointAdapter({
      schema: mfaVerifyRequestSchema,
      authenticate: deps.authService.authenticateAccessToken.bind(
        deps.authService,
      ),
      handler: async (_c, payload, auth) => {
        await deps.authService.verifyMfa(
          auth.userId,
          payload.factorId,
          payload.code,
        );
        return { status: "ok" };
      },
    }),
  );

  app.post(
    "/v1/password/change",
    authenticatedEndpointAdapter({
      schema: passwordChangeRequestSchema,
      authenticate: deps.authService.authenticateAccessToken.bind(
        deps.authService,
      ),
      handler: async (_c, payload, auth) => {
        await deps.authService.changePassword({
          userId: auth.userId,
          currentPassword: payload.currentPassword,
          newPassword: payload.newPassword,
        });
        return { status: "ok" };
      },
    }),
  );

  app.post(
    "/v1/authorization/check",
    authenticatedEndpointAdapter({
      schema: authCheckRequestSchema,
      authenticate: deps.authService.authenticateAccessToken.bind(
        deps.authService,
      ),
      handler: async (_c, payload, auth) => {
        const result = await deps.authService.authorizationCheck({
          userId: auth.userId,
          action: payload.action,
          resource: payload.resource,
          ...(payload.organizationId
            ? { organizationId: payload.organizationId }
            : {}),
          ...(payload.groupId ? { groupId: payload.groupId } : {}),
        });

        return {
          allowed: result.allowed,
          permissionKey: result.permissionKey,
          source: result.source,
        };
      },
    }),
  );

  app.post(
    "/v1/entitlements/check",
    authenticatedEndpointAdapter({
      schema: entitlementCheckRequestSchema,
      authenticate: deps.authService.authenticateAccessToken.bind(
        deps.authService,
      ),
      handler: async (_c, payload, auth) => {
        const result = await deps.authService.entitlementCheck({
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
        return result;
      },
    }),
  );

  app.get(
    "/v1/sessions",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate: deps.authService.authenticateAccessToken.bind(
        deps.authService,
      ),
      handler: async (_c, _payload, auth) => {
        const sessions = await deps.authService.listSessions(auth.userId);
        return { sessions };
      },
    }),
  );

  app.post(
    "/v1/sessions/revoke",
    authenticatedEndpointAdapter({
      schema: revokeSessionRequestSchema,
      authenticate: deps.authService.authenticateAccessToken.bind(
        deps.authService,
      ),
      handler: async (_c, payload, auth) => {
        await deps.authService.revokeSession(auth.userId, payload.sessionId);
        return { status: "revoked", sessionId: payload.sessionId };
      },
    }),
  );

  app.post(
    "/v1/sessions/revoke-all",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate: deps.authService.authenticateAccessToken.bind(
        deps.authService,
      ),
      handler: async (_c, _payload, auth) => {
        await deps.authService.revokeAllSessions(auth.userId);
        return { status: "revoked_all" };
      },
    }),
  );

  app.post(
    "/v1/identities/google/link",
    authenticatedEndpointAdapter({
      schema: googleLinkRequestSchema,
      authenticate: deps.authService.authenticateAccessToken.bind(
        deps.authService,
      ),
      handler: async (_c, payload, auth) => {
        const googleConfig =
          await deps.configService.getSocialLoginConfig("google");
        if (!googleConfig.providerEnabled) {
          throw new ApiError(
            403,
            "google_login_disabled",
            "Google login is currently disabled",
          );
        }
        await deps.authService.verifyCurrentPassword(
          auth.userId,
          payload.currentPassword,
        );
        await deps.authService.linkGoogleIdentity({
          userId: auth.userId,
          idToken: payload.idToken,
          clientId: googleConfig.clientId,
        });

        return { status: "linked" };
      },
    }),
  );

  app.post(
    "/v1/identities/google/unlink",
    authenticatedEndpointAdapter({
      schema: googleUnlinkRequestSchema,
      authenticate: deps.authService.authenticateAccessToken.bind(
        deps.authService,
      ),
      handler: async (_c, payload, auth) => {
        await deps.authService.verifyCurrentPassword(
          auth.userId,
          payload.currentPassword,
        );
        await deps.authService.unlinkSocialIdentity(
          auth.userId,
          "google",
          payload.providerSubject,
        );

        return { status: "unlinked" };
      },
    }),
  );

  return app;
};
