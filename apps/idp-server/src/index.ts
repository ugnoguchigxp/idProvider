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
import { MfaRecoveryRepository } from "./modules/mfa/mfa-recovery.repository.js";
import { MfaRecoveryService } from "./modules/mfa/mfa-recovery.service.js";
import { RBACRepository } from "./modules/rbac/rbac.repository.js";
import { RBACService } from "./modules/rbac/rbac.service.js";
import { SessionRepository } from "./modules/sessions/session.repository.js";
import { SessionService } from "./modules/sessions/sessions.service.js";
import { AccountDeletionRepository } from "./modules/users/account-deletion.repository.js";
import { AccountDeletionService } from "./modules/users/account-deletion.service.js";
import { IdentityRepository } from "./modules/users/identity.repository.js";
import { NoopProfileCache } from "./modules/users/profile-cache.js";
import { UserRepository } from "./modules/users/user.repository.js";
import { UserProfileRepository } from "./modules/users/user-profile.repository.js";
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
  const userProfileRepository = new UserProfileRepository(db);
  const identityRepository = new IdentityRepository(db);
  const accountDeletionRepository = new AccountDeletionRepository(db);
  const sessionRepository = new SessionRepository(db);
  const mfaRepository = new MfaRepository(db);
  const mfaRecoveryRepository = new MfaRecoveryRepository(db);
  const rbacRepository = new RBACRepository(db);

  // Services
  const rbacService = new RBACService(rbacRepository);

  const mfaRecoveryService = new MfaRecoveryService({
    mfaRecoveryRepository,
    auditRepository,
    env,
    logger,
  });

  const mfaService = new MfaService({
    mfaRepository,
    mfaRecoveryService,
  });

  const authService = new AuthService({
    authRepository,
    verificationRepository,
    userRepository,
    sessionRepository,
    rbacService,
    auditRepository,
    mfaService,
    mfaRecoveryService,
    configService,
    rateLimiter,
    env,
    logger,
  });

  const userService = new UserService({
    db,
    userRepository,
    userProfileRepository,
    profileCache: new NoopProfileCache(),
    identityRepository,
    auditRepository,
    logger,
  });

  const sessionService = new SessionService({
    sessionRepository,
  });

  const accountDeletionService = new AccountDeletionService({
    accountDeletionRepository,
    userRepository,
    mfaService,
    auditRepository,
    env,
    logger,
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
    accountDeletionService,
    sessionService,
    mfaService,
    mfaRecoveryService,
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
    {
      getMe: async (userId: string) => {
        return userService.getOidcAccount(userId);
      },
      getAuthorizationSnapshot:
        rbacService.getAuthorizationSnapshot.bind(rbacService),
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
