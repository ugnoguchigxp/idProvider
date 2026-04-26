import { WebAuthnService } from "@idp/auth-core";
import type { DbClient } from "@idp/db";
import type { AppEnv } from "../config/env.js";
import { AuthService } from "../modules/auth/auth.service.js";
import { MfaService } from "../modules/mfa/mfa.service.js";
import { MfaRecoveryService } from "../modules/mfa/mfa-recovery.service.js";
import { OAuthClientService } from "../modules/oauth-clients/oauth-client.service.js";
import { RBACService } from "../modules/rbac/rbac.service.js";
import { RedisRBACCache } from "../modules/rbac/rbac-cache.js";
import { SessionService } from "../modules/sessions/sessions.service.js";
import { AccountDeletionService } from "../modules/users/account-deletion.service.js";
import { NoopProfileCache } from "../modules/users/profile-cache.js";
import { UserService } from "../modules/users/users.service.js";
import type { AppInfrastructure } from "./create-infrastructure.js";
import type { AppRepositories } from "./create-repositories.js";

export type CreateServicesInput = {
  env: AppEnv;
  db: DbClient;
  redis: AppInfrastructure["redis"];
  logger: AppInfrastructure["logger"];
  configService: AppInfrastructure["configService"];
  rateLimiter: AppInfrastructure["rateLimiter"];
  onSecurityEvent: AppInfrastructure["onSecurityEvent"];
  repositories: AppRepositories;
};

export const createServices = ({
  env,
  db,
  redis,
  logger,
  configService,
  rateLimiter,
  onSecurityEvent,
  repositories,
}: CreateServicesInput) => {
  const rbacService = new RBACService(repositories.rbacRepository, {
    cache: new RedisRBACCache(redis),
    cacheEnabled: env.RBAC_CACHE_ENABLED,
    cachePercent: env.RBAC_CACHE_PERCENT,
    authTtlSeconds: env.RBAC_CACHE_AUTH_TTL_SECONDS,
    entitlementTtlSeconds: env.RBAC_CACHE_ENT_TTL_SECONDS,
    negativeTtlSeconds: env.RBAC_CACHE_NEGATIVE_TTL_SECONDS,
  });

  const mfaRecoveryService = new MfaRecoveryService({
    mfaRecoveryRepository: repositories.mfaRecoveryRepository,
    auditRepository: repositories.auditRepository,
    env,
    logger,
  });

  const mfaService = new MfaService({
    mfaRepository: repositories.mfaRepository,
    mfaRecoveryService,
  });

  const authService = new AuthService({
    authRepository: repositories.authRepository,
    verificationRepository: repositories.verificationRepository,
    userRepository: repositories.userRepository,
    identityRepository: repositories.identityRepository,
    sessionRepository: repositories.sessionRepository,
    rbacService,
    auditRepository: repositories.auditRepository,
    mfaService,
    mfaRecoveryService,
    configService,
    rateLimiter,
    env,
    logger,
  });

  const userService = new UserService({
    db,
    userRepository: repositories.userRepository,
    userProfileRepository: repositories.userProfileRepository,
    profileCache: new NoopProfileCache(),
    identityRepository: repositories.identityRepository,
    auditRepository: repositories.auditRepository,
    logger,
  });

  const sessionService = new SessionService({
    sessionRepository: repositories.sessionRepository,
  });

  const accountDeletionService = new AccountDeletionService({
    accountDeletionRepository: repositories.accountDeletionRepository,
    userRepository: repositories.userRepository,
    mfaService,
    auditRepository: repositories.auditRepository,
    env,
    logger,
  });

  const webauthnService = new WebAuthnService(db, redis, {
    rpName: env.WEBAUTHN_RP_NAME,
    rpID: env.WEBAUTHN_RP_ID,
    origin: env.WEBAUTHN_ORIGIN,
    onSecurityEvent,
  });

  const oauthClientService = new OAuthClientService({
    oauthClientRepository: repositories.oauthClientRepository,
    auditRepository: repositories.auditRepository,
    env,
  });

  return {
    authService,
    userService,
    accountDeletionService,
    sessionService,
    mfaService,
    mfaRecoveryService,
    rbacService,
    oauthClientService,
    webauthnService,
  };
};

export type AppServices = ReturnType<typeof createServices>;
