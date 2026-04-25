import type {
  ConfigService,
  KeyStoreService,
  RedisClient,
  WebAuthnService,
} from "@idp/auth-core";
import type pino from "pino";
import type { AppEnv } from "../config/env.js";
import type { AuthService } from "../modules/auth/auth.service.js";
import type { MfaService } from "../modules/mfa/mfa.service.js";
import type { MfaRecoveryService } from "../modules/mfa/mfa-recovery.service.js";
import type { RBACService } from "../modules/rbac/rbac.service.js";
import type { SessionService } from "../modules/sessions/sessions.service.js";
import type { AccountDeletionService } from "../modules/users/account-deletion.service.js";
import type { UserService } from "../modules/users/users.service.js";
import type { RateLimiter } from "./rate-limiter.js";

export type AppDependencies = {
  env: AppEnv;
  authService: AuthService;
  userService: UserService;
  accountDeletionService: AccountDeletionService;
  sessionService: SessionService;
  mfaService: MfaService;
  mfaRecoveryService: MfaRecoveryService;
  rbacService: RBACService;
  webauthnService: WebAuthnService;
  configService: ConfigService;
  keyStore: KeyStoreService;
  redis: RedisClient;
  logger: pino.Logger;
  rateLimiter: RateLimiter;
};
