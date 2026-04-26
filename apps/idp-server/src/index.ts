import "./tracing.js";
import { serve } from "@hono/node-server";
import { buildApp } from "./app.js";
import { createRuntime } from "./composition/create-runtime.js";
import { loadEnv } from "./config/env.js";
import { createOidcProvider } from "./core/oidc-provider.js";

const bootstrap = async () => {
  const env = loadEnv(process.env);
  const runtime = createRuntime(env);
  const {
    logger,
    keyStore,
    redis,
    pool,
    services,
    appDependencies,
    repositories,
  } = runtime;

  const rotation = await keyStore.rotateIfDue();
  if (rotation.rotated) {
    await repositories.auditRepository.createSecurityEvent({
      eventType: "key.rotation.scheduled",
      userId: null,
      payload: {
        activeKid: rotation.activeKid,
        previousKid: "previousKid" in rotation ? rotation.previousKid : null,
      },
    });
  }

  const app = buildApp(appDependencies);

  const apiServer = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(
      { event: "server.started", port: info.port },
      "idp-server started",
    );
  });

  const oidcProvider = createOidcProvider(
    env,
    await keyStore.getActivePrivateJwks(),
    {
      getMe: async (userId: string) =>
        services.userService.getOidcAccount(userId),
      getAuthorizationSnapshot:
        services.rbacService.getAuthorizationSnapshot.bind(
          services.rbacService,
        ),
    },
  );
  const oidcServer = oidcProvider.listen(env.OIDC_PORT, () => {
    logger.info(
      { event: "oidc.started", port: env.OIDC_PORT, issuer: env.OIDC_ISSUER },
      "oidc-provider started",
    );
  });

  const shutdown = async (signal: string) => {
    logger.info(
      { event: "server.shutdown", signal },
      "shutting down idp-server",
    );
    apiServer.close();
    oidcServer.close();
    await redis.quit();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
};

void bootstrap().catch((error: unknown) => {
  process.stderr.write(`bootstrap_failed: ${String(error)}\n`);
  process.exit(1);
});
