import "./tracing.js";
import { serve } from "@hono/node-server";
import {
  AuthService,
  ConfigService,
  createRedisClient,
  KeyStoreService,
  WebAuthnService,
} from "@idp/auth-core";
import { createDb } from "@idp/db";
import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createLogger } from "./core/logger.js";
import { createOidcProvider } from "./core/oidc-provider.js";
import { RateLimiter } from "./core/rate-limiter.js";
import { createSecurityNotifier } from "./core/security-notifier.js";

const bootstrap = async () => {
  const env = loadEnv(process.env);
  const logger = createLogger(env.LOG_LEVEL);
  const { db, pool } = createDb(env.DATABASE_URL);
  const configService = new ConfigService(db);
  const redis = createRedisClient(env.REDIS_URL);
  const onSecurityEvent = createSecurityNotifier(configService, logger);

  const webauthnService = new WebAuthnService(db, redis, {
    rpName: env.WEBAUTHN_RP_NAME,
    rpID: env.WEBAUTHN_RP_ID,
    origin: env.WEBAUTHN_ORIGIN,
    onSecurityEvent,
  });

  const authService = new AuthService(db, {
    accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: env.REFRESH_TOKEN_TTL_SECONDS,
    argon2: {
      memoryCost: env.ARGON2_MEMORY_COST,
      timeCost: env.ARGON2_TIME_COST,
      parallelism: env.ARGON2_PARALLELISM,
    },
    mfaIssuer: env.MFA_ISSUER,
    onSecurityEvent,
  });

  const keyStore = new KeyStoreService(db, {
    rotationIntervalHours: env.JWKS_ROTATION_INTERVAL_HOURS,
    gracePeriodHours: env.JWKS_GRACE_PERIOD_HOURS,
  });

  const rateLimiter = new RateLimiter(redis);

  await keyStore.rotateIfDue();

  const app = buildApp({
    env,
    authService,
    webauthnService,
    configService,
    keyStore,
    redis,
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

  let oidcProvider = createOidcProvider(
    env,
    await keyStore.getActivePrivateJwks(),
    authService,
  );
  let oidcServer = oidcProvider.listen(env.OIDC_PORT, () => {
    logger.info(
      { event: "oidc.started", port: env.OIDC_PORT, issuer: env.OIDC_ISSUER },
      "oidc-provider started",
    );
  });

  const rotationTimer = setInterval(
    () => {
      void (async () => {
        const rotation = await keyStore.rotateIfDue();
        if (!rotation.rotated) {
          return;
        }

        const nextProvider = createOidcProvider(
          env,
          await keyStore.getActivePrivateJwks(),
          authService,
        );
        await new Promise<void>((resolve, reject) => {
          oidcServer.close((error?: Error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });

        oidcProvider = nextProvider;
        oidcServer = oidcProvider.listen(env.OIDC_PORT, () => {
          logger.info(
            {
              event: "oidc.restarted_after_jwks_rotation",
              activeKid: rotation.activeKid,
              previousKid: rotation.previousKid,
            },
            "oidc-provider restarted after jwks rotation",
          );
        });
      })().catch((error: unknown) => {
        logger.error(
          { event: "jwks.rotate_failed", error },
          "jwks rotation failed",
        );
      });
    },
    60 * 60 * 1000,
  );
  rotationTimer.unref?.();

  const shutdown = async (signal: string) => {
    logger.info(
      { event: "server.shutdown", signal },
      "shutting down idp-server",
    );
    clearInterval(rotationTimer);
    apiServer.close();
    oidcServer.close();
    await redis.quit();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
};

void bootstrap().catch((error: unknown) => {
  process.stderr.write(`bootstrap_failed: ${String(error)}\n`);
  process.exit(1);
});
