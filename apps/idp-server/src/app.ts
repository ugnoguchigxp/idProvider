import {
  oauthIntrospectionRequestSchema,
  oauthRevocationRequestSchema,
  refreshRequestSchema,
} from "@idp/shared";
import { Hono } from "hono";
import { publicEndpointAdapter } from "./adapters/public-endpoint-adapter.js";
import type { AppDependencies } from "./core/app-context.js";
import { assertOAuthClientAuth } from "./core/oauth-client-auth.js";
import { handleError } from "./middleware/error-handler.js";
import { traceMiddleware } from "./middleware/trace.js";
import { buildAuthenticatedRoutes } from "./routes/authenticated-routes.js";
import { buildPublicRoutes } from "./routes/public-routes.js";

export const buildApp = (deps: AppDependencies) => {
  const app = new Hono();

  app.use("*", traceMiddleware);
  app.onError(handleError);

  app.route("/", buildPublicRoutes(deps));
  app.route("/", buildAuthenticatedRoutes(deps));

  const issuer = deps.env.OIDC_ISSUER;

  app.get("/.well-known/openid-configuration", (c) =>
    c.json({
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      revocation_endpoint: `${issuer}/oauth/revocation`,
      introspection_endpoint: `${issuer}/oauth/introspection`,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
    }),
  );

  app.get("/.well-known/jwks.json", (c) => c.json({ keys: [] }));

  app.post(
    "/oauth/revocation",
    publicEndpointAdapter({
      schema: oauthRevocationRequestSchema,
      handler: async (c, payload) => {
        assertOAuthClientAuth(c.req.header("authorization"), {
          clientId: deps.env.OAUTH_CLIENT_ID,
          clientSecret: deps.env.OAUTH_CLIENT_SECRET,
        });

        await deps.authService.revokeByToken(payload.token);
        return { status: "accepted" };
      },
    }),
  );

  app.post(
    "/oauth/introspection",
    publicEndpointAdapter({
      schema: oauthIntrospectionRequestSchema,
      handler: async (c, payload) => {
        assertOAuthClientAuth(c.req.header("authorization"), {
          clientId: deps.env.OAUTH_CLIENT_ID,
          clientSecret: deps.env.OAUTH_CLIENT_SECRET,
        });
        return deps.authService.introspectToken(payload.token);
      },
    }),
  );

  app.post(
    "/v1/token/refresh",
    publicEndpointAdapter({
      schema: refreshRequestSchema,
      handler: async (_c, payload) =>
        deps.authService.refresh(payload.refreshToken),
    }),
  );

  return app;
};
