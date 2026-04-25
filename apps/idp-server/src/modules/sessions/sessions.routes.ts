import { emptyRequestSchema, revokeSessionRequestSchema } from "@idp/shared";
import { Hono } from "hono";
import { authenticatedEndpointAdapter } from "../../adapters/authenticated-endpoint-adapter.js";
import type { AuthService } from "../auth/auth.service.js";
import type { SessionService } from "./sessions.service.js";

export type SessionRoutesDependencies = {
  sessionService: SessionService;
  authService: AuthService;
};

export const createSessionRoutes = (deps: SessionRoutesDependencies) => {
  const app = new Hono();

  const authenticate = deps.authService.authenticateAccessToken.bind(
    deps.authService,
  );

  app.get(
    "/v1/sessions",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate,
      handler: async (_c, _payload, auth) => {
        const result = await deps.sessionService.listSessions(auth.userId);
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  app.post(
    "/v1/sessions/revoke",
    authenticatedEndpointAdapter({
      schema: revokeSessionRequestSchema,
      authenticate,
      handler: async (_c, payload, auth) => {
        const result = await deps.sessionService.revokeSession(
          auth.userId,
          payload.sessionId,
        );
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  app.post(
    "/v1/sessions/revoke-all",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate,
      handler: async (_c, _payload, auth) => {
        const result = await deps.sessionService.revokeAllSessions(auth.userId);
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  return app;
};
