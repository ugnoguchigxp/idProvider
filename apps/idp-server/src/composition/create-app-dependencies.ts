import type { AppEnv } from "../config/env.js";
import type { AppDependencies } from "../core/app-context.js";
import type { AppInfrastructure } from "./create-infrastructure.js";
import type { AppRepositories } from "./create-repositories.js";
import type { AppServices } from "./create-services.js";

export type CreateAppDependenciesInput = {
  env: AppEnv;
  infrastructure: Pick<
    AppInfrastructure,
    "configService" | "keyStore" | "redis" | "logger" | "rateLimiter"
  >;
  repositories: Pick<AppRepositories, "auditRepository">;
  services: AppServices;
};

export const createAppDependencies = ({
  env,
  infrastructure,
  repositories,
  services,
}: CreateAppDependenciesInput): AppDependencies => ({
  env,
  authService: services.authService,
  userService: services.userService,
  accountDeletionService: services.accountDeletionService,
  sessionService: services.sessionService,
  mfaService: services.mfaService,
  mfaRecoveryService: services.mfaRecoveryService,
  rbacService: services.rbacService,
  oauthClientService: services.oauthClientService,
  webauthnService: services.webauthnService,
  configService: infrastructure.configService,
  auditRepository: repositories.auditRepository,
  keyStore: infrastructure.keyStore,
  redis: infrastructure.redis,
  logger: infrastructure.logger,
  rateLimiter: infrastructure.rateLimiter,
});
