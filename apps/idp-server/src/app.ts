import { ApiError, oauthRevocationRequestSchema } from "@idp/shared";
import { Hono } from "hono";
import { publicEndpointAdapter } from "./adapters/public-endpoint-adapter.js";
import type { AppDependencies } from "./core/app-context.js";
import {
  markDependencyDown,
  markDependencyUp,
  metricsContentType,
  recordDependencyError,
  renderMetrics,
} from "./core/metrics.js";
import { handleError } from "./middleware/error-handler.js";
import { httpMetricsMiddleware } from "./middleware/http-metrics.js";
import { traceMiddleware } from "./middleware/trace.js";
import { createAuditRoutes } from "./modules/audit/audit.routes.js";
import { createAuthRoutes } from "./modules/auth/auth.routes.js";
import { createConfigRoutes } from "./modules/config/config.routes.js";
import { createKeyManagementRoutes } from "./modules/keys/keys.routes.js";
import { createMfaRoutes } from "./modules/mfa/mfa.routes.js";
import { createOAuthClientRoutes } from "./modules/oauth-clients/oauth-client.routes.js";
import { createRbacRoutes } from "./modules/rbac/rbac.routes.js";
import { createSessionRoutes } from "./modules/sessions/sessions.routes.js";
import { createUserRoutes } from "./modules/users/users.routes.js";
import { getIpAddress } from "./utils/ip-address.js";

export const buildApp = (deps: AppDependencies) => {
  const app = new Hono();
  const metricsEnabled = deps.env.METRICS_ENABLED ?? true;
  const metricsBearerToken = deps.env.METRICS_BEARER_TOKEN?.trim() || "";

  app.use("*", httpMetricsMiddleware);
  app.use("*", traceMiddleware);
  app.onError(handleError);

  // Mount domain routes
  app.route("/", createAuthRoutes(deps));
  app.route("/", createUserRoutes(deps));
  app.route("/", createSessionRoutes(deps));
  app.route("/", createMfaRoutes(deps));
  app.route("/", createRbacRoutes(deps));
  app.route("/", createConfigRoutes(deps));
  app.route("/", createOAuthClientRoutes(deps));
  app.route("/", createKeyManagementRoutes(deps));
  app.route("/", createAuditRoutes(deps));

  app.get("/healthz", (c) => c.json({ ok: true }));
  app.get("/readyz", async (c) => {
    const [dbCheck, redisCheck] = await Promise.allSettled([
      deps.configService.getNotificationConfig(),
      deps.redis.ping(),
    ]);

    const dbReady = dbCheck.status === "fulfilled";
    const redisReady =
      redisCheck.status === "fulfilled" && redisCheck.value === "PONG";

    if (dbReady) {
      markDependencyUp("db");
    } else {
      markDependencyDown("db");
      recordDependencyError("db");
    }

    if (redisReady) {
      markDependencyUp("redis");
    } else {
      markDependencyDown("redis");
      recordDependencyError("redis");
    }

    if (!dbReady || !redisReady) {
      return c.json(
        {
          code: "dependency_unavailable",
          message: "One or more dependencies are unavailable",
        },
        503,
      );
    }

    return c.json({ ready: true });
  });
  app.get("/metrics", async (c) => {
    if (!metricsEnabled) {
      return c.notFound();
    }
    if (metricsBearerToken.length > 0) {
      const authorization = c.req.header("authorization");
      if (authorization !== `Bearer ${metricsBearerToken}`) {
        return c.json(
          { code: "unauthorized", message: "Unauthorized metrics access" },
          401,
        );
      }
    }
    c.header("Content-Type", metricsContentType);
    return c.body(await renderMetrics());
  });

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
        markDependencyDown("oidc");
        recordDependencyError("oidc");
        return c.json(
          {
            code: "oidc_discovery_unavailable",
            message: "OIDC discovery is unavailable",
          },
          502,
        );
      }
      markDependencyUp("oidc");
      return c.json(await response.json());
    } catch (_error: unknown) {
      markDependencyDown("oidc");
      recordDependencyError("oidc");
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
        await deps.oauthClientService.authenticateClientBasic(
          c.req.header("authorization"),
        );
        const result = await deps.authService.revokeByToken(payload.token);
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  return app;
};
