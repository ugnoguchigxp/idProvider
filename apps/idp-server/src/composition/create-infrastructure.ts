import {
  ConfigService,
  createRedisClient,
  KeyStoreService,
  type RedisClient,
} from "@idp/auth-core";
import { createDb, type DbClient } from "@idp/db";
import type pino from "pino";
import type { AppEnv } from "../config/env.js";
import { createLogger } from "../core/logger.js";
import { RateLimiter } from "../core/rate-limiter.js";
import { createSecurityNotifier } from "../core/security-notifier.js";

export type AppInfrastructure = {
  db: DbClient;
  pool: { end: () => Promise<void> };
  redis: RedisClient;
  logger: pino.Logger;
  configService: ConfigService;
  keyStore: KeyStoreService;
  rateLimiter: RateLimiter;
  onSecurityEvent: ReturnType<typeof createSecurityNotifier>;
};

export const createInfrastructure = (env: AppEnv): AppInfrastructure => {
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

  return {
    db,
    pool,
    redis,
    logger,
    configService,
    keyStore,
    rateLimiter,
    onSecurityEvent,
  };
};

export type SecurityEventHandler = AppInfrastructure["onSecurityEvent"];
export type AppLogger = pino.Logger;
