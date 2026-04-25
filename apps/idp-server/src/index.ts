import "./tracing.js";
import { serve } from "@hono/node-server";
import {
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
import { AuditRepository } from "./modules/audit/audit.repository.js";
import { AuthRepository } from "./modules/auth/auth.repository.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { VerificationRepository } from "./modules/auth/verification.repository.js";
import { MfaRepository } from "./modules/mfa/mfa.repository.js";
import { MfaService } from "./modules/mfa/mfa.service.js";
import { RBACRepository } from "./modules/rbac/rbac.repository.js";
import { RBACService } from "./modules/rbac/rbac.service.js";
import { SessionRepository } from "./modules/sessions/session.repository.js";
import { SessionService } from "./modules/sessions/sessions.service.js";
import { IdentityRepository } from "./modules/users/identity.repository.js";
import { UserRepository } from "./modules/users/user.repository.js";
import { UserService } from "./modules/users/users.service.js";

const bootstrap = async () => {
  const env = loadEnv(process.env);
  const logger = createLogger(env.LOG_LEVEL);
  const { db, pool } = createDb(env.DATABASE_URL);
  const configService = new ConfigService(db);
  const redis = createRedisClient(env.REDIS_URL);
  const onSecurityEvent = createSecurityNotifier(configService, logger);

  const keyStore = new KeyStoreService(db, {
    rotationIntervalHours: env.JWKS_ROTATION_INTERVAL_HOURS,
    gracePeriodHours: env.JWKS_GRACE_PERIOD_HOURS,
  });

  const rateLimiter = new RateLimiter(redis);

  // Repositories
  const auditRepository = new AuditRepository(db);
  const authRepository = new AuthRepository(db);
  const verificationRepository = new VerificationRepository(db);
  const userRepository = new UserRepository(db);
  const identityRepository = new IdentityRepository(db);
  const sessionRepository = new SessionRepository(db);
  const mfaRepository = new MfaRepository(db);
  const rbacRepository = new RBACRepository(db);

  // Services
  const rbacService = new RBACService(rbacRepository);

  const authService = new AuthService({
    authRepository,
    verificationRepository,
    userRepository,
    sessionRepository,
    rbacService,
    auditRepository,
    configService,
    env,
    logger,
  });

  const userService = new UserService({
    userRepository,
    identityRepository,
    auditRepository,
    logger,
  });

  const sessionService = new SessionService({
    sessionRepository,
  });

  const mfaService = new MfaService({
    mfaRepository,
  });

  const webauthnService = new WebAuthnService(db, redis, {
    rpName: env.WEBAUTHN_RP_NAME,
    rpID: env.WEBAUTHN_RP_ID,
    origin: env.WEBAUTHN_ORIGIN,
    onSecurityEvent,
  });

  await keyStore.rotateIfDue();

  const app = buildApp({
    env,
    authService,
    userService,
    sessionService,
    mfaService,
    rbacService,
    webauthnService,
    configService,
    keyStore,
    redis,
    logger,
    rateLimiter,
  });

  const apiServer = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info(
      { event: "server.started", port: info.port },
      "idp-server started",
    );
  });

  // OIDC Provider setup...
  const oidcProvider = createOidcProvider(
    env,
    await keyStore.getActivePrivateJwks(),
    // biome-ignore lint/suspicious/noExplicitAny: Required for oidc-provider compatibility
    authService as any,
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
