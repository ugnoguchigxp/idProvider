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

  app.get("/.well-known/openid-configuration", async (c) => {
    try {
      const response = await fetch(
        `${issuer}/.well-known/openid-configuration`,
      );
      if (!response.ok) {
        return c.json(
          {
            code: "oidc_discovery_unavailable",
            message: "OIDC discovery is unavailable",
          },
          502,
        );
      }

      return c.json(await response.json());
    } catch (_error: unknown) {
      return c.json(
        {
          code: "oidc_discovery_unavailable",
          message: "OIDC discovery is unavailable",
        },
        502,
      );
    }
  });

  app.get("/.well-known/jwks.json", async (c) =>
    c.json(await deps.keyStore.getPublicJwks()),
  );

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
