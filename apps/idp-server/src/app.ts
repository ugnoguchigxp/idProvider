import { oauthRevocationRequestSchema } from "@idp/shared";
import { Hono } from "hono";
import { publicEndpointAdapter } from "./adapters/public-endpoint-adapter.js";
import type { AppDependencies } from "./core/app-context.js";
import { assertOAuthClientAuth } from "./core/oauth-client-auth.js";
import { handleError } from "./middleware/error-handler.js";
import { traceMiddleware } from "./middleware/trace.js";
import { createAuthRoutes } from "./modules/auth/auth.routes.js";
import { createConfigRoutes } from "./modules/config/config.routes.js";
import { createMfaRoutes } from "./modules/mfa/mfa.routes.js";
import { createSessionRoutes } from "./modules/sessions/sessions.routes.js";
import { createUserRoutes } from "./modules/users/users.routes.js";

export const buildApp = (deps: AppDependencies) => {
  const app = new Hono();

  app.use("*", traceMiddleware);
  app.onError(handleError);

  // Mount domain routes
  app.route("/", createAuthRoutes(deps));
  app.route("/", createUserRoutes(deps));
  app.route("/", createSessionRoutes(deps));
  app.route("/", createMfaRoutes(deps));
  app.route("/", createConfigRoutes(deps));

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
        return deps.authService.revokeByToken(payload.token);
      },
    }),
  );

  return app;
};
