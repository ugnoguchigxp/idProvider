import type { AuthService } from "@idp/auth-core";
import type pino from "pino";
import type { AppEnv } from "../config/env.js";
import type { RateLimiter } from "./rate-limiter.js";

export type AppDependencies = {
  env: AppEnv;
  authService: AuthService;
  logger: pino.Logger;
  rateLimiter: RateLimiter;
};
