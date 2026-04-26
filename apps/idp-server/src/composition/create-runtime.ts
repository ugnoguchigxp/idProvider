import type { AppEnv } from "../config/env.js";
import type { AppDependencies } from "../core/app-context.js";
import { createAppDependencies } from "./create-app-dependencies.js";
import {
  type AppInfrastructure,
  createInfrastructure,
} from "./create-infrastructure.js";
import {
  type AppRepositories,
  createRepositories,
} from "./create-repositories.js";
import { type AppServices, createServices } from "./create-services.js";

export type AppRuntime = AppInfrastructure & {
  repositories: AppRepositories;
  services: AppServices;
  appDependencies: AppDependencies;
};

export const createRuntime = (env: AppEnv): AppRuntime => {
  const infrastructure = createInfrastructure(env);
  const repositories = createRepositories(infrastructure.db);
  const services = createServices({
    env,
    db: infrastructure.db,
    redis: infrastructure.redis,
    logger: infrastructure.logger,
    configService: infrastructure.configService,
    rateLimiter: infrastructure.rateLimiter,
    onSecurityEvent: infrastructure.onSecurityEvent,
    repositories,
  });
  const appDependencies = createAppDependencies({
    env,
    infrastructure,
    repositories,
    services,
  });

  return {
    ...infrastructure,
    repositories,
    services,
    appDependencies,
  };
};
