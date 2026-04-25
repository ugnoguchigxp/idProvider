import { serve } from "@hono/node-server";
import { AuthService } from "@idp/auth-core";
import { createDb } from "@idp/db";
import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createLogger } from "./core/logger.js";
import { createOidcProvider } from "./core/oidc-provider.js";
import { RateLimiter } from "./core/rate-limiter.js";

const env = loadEnv(process.env);
const logger = createLogger(env.LOG_LEVEL);
const { db, pool } = createDb(env.DATABASE_URL);
const authService = new AuthService(db);
const rateLimiter = new RateLimiter();

const app = buildApp({
  env,
  authService,
  logger,
  rateLimiter,
});

const apiServer = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    logger.info(
      { event: "server.started", port: info.port },
      "idp-server started",
    );
  },
);

const oidcProvider = createOidcProvider(env);
const oidcServer = oidcProvider.listen(env.OIDC_PORT, () => {
  logger.info(
    { event: "oidc.started", port: env.OIDC_PORT, issuer: env.OIDC_ISSUER },
    "oidc-provider started",
  );
});

const shutdown = async (signal: string) => {
  logger.info({ event: "server.shutdown", signal }, "shutting down idp-server");
  apiServer.close();
  oidcServer.close();
  await pool.end();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
