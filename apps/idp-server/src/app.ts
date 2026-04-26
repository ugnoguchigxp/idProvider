import { ApiError, oauthRevocationRequestSchema } from "@idp/shared";
import { Hono } from "hono";
import { publicEndpointAdapter } from "./adapters/public-endpoint-adapter.js";
import type { AppDependencies } from "./core/app-context.js";
import { assertOAuthClientAuth } from "./core/oauth-client-auth.js";
import { handleError } from "./middleware/error-handler.js";
import { traceMiddleware } from "./middleware/trace.js";
import { createAuthRoutes } from "./modules/auth/auth.routes.js";
import { createConfigRoutes } from "./modules/config/config.routes.js";
import { createMfaRoutes } from "./modules/mfa/mfa.routes.js";
import { createRbacRoutes } from "./modules/rbac/rbac.routes.js";
import { createSessionRoutes } from "./modules/sessions/sessions.routes.js";
import { createUserRoutes } from "./modules/users/users.routes.js";
import { getIpAddress } from "./utils/ip-address.js";

export const buildApp = (deps: AppDependencies) => {
  const app = new Hono();

  app.use("*", traceMiddleware);
  app.onError(handleError);

  // Mount domain routes
  app.route("/", createAuthRoutes(deps));
  app.route("/", createUserRoutes(deps));
  app.route("/", createSessionRoutes(deps));
  app.route("/", createMfaRoutes(deps));
  app.route("/", createRbacRoutes(deps));
  app.route("/", createConfigRoutes(deps));

  app.get("/healthz", (c) => c.json({ ok: true }));
  app.get("/readyz", (c) => c.json({ ready: true }));

  const issuer = deps.env.OIDC_ISSUER;
  const consumeDiscoveryRateLimit = async (ipAddress: string | null) => {
    const rate = await deps.rateLimiter.consume(
      `discovery:${ipAddress ?? "unknown"}`,
      deps.env.RATE_LIMIT_DISCOVERY_PER_MIN,
      60,
    );
    if (!rate.allowed) {
      return false;
    }
    return true;
  };

  app.get("/.well-known/openid-configuration", async (c) => {
    const ipAddress = getIpAddress(c.req.header("x-forwarded-for"));
    if (!(await consumeDiscoveryRateLimit(ipAddress))) {
      return c.json(
        { code: "rate_limited", message: "Too many requests" },
        429,
      );
    }
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

  app.get("/.well-known/jwks.json", async (c) => {
    const ipAddress = getIpAddress(c.req.header("x-forwarded-for"));
    if (!(await consumeDiscoveryRateLimit(ipAddress))) {
      return c.json(
        { code: "rate_limited", message: "Too many requests" },
        429,
      );
    }
    return c.json(await deps.keyStore.getPublicJwks());
  });

  app.post(
    "/oauth/revocation",
    publicEndpointAdapter({
      schema: oauthRevocationRequestSchema,
      handler: async (c, payload) => {
        const ipAddress = getIpAddress(c.req.header("x-forwarded-for"));
        const rate = await deps.rateLimiter.consume(
          `oauth-revocation:${ipAddress ?? "unknown"}`,
          deps.env.RATE_LIMIT_OAUTH_PER_MIN,
          60,
        );
        if (!rate.allowed) {
          throw new ApiError(
            429,
            "rate_limited",
            "Too many OAuth revocation requests",
          );
        }
        assertOAuthClientAuth(c.req.header("authorization"), {
          clientId: deps.env.OAUTH_CLIENT_ID,
          clientSecret: deps.env.OAUTH_CLIENT_SECRET,
        });
        const result = await deps.authService.revokeByToken(payload.token);
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  return app;
};
