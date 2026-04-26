import { z } from "zod";
import { APP_CONSTANTS } from "./constants.js";

const envBoolean = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .transform((value, ctx) => {
      if (typeof value === "boolean") {
        return value;
      }

      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1" || normalized === "yes") {
        return true;
      }
      if (normalized === "false" || normalized === "0" || normalized === "no") {
        return false;
      }

      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expected boolean-like value (true/false/1/0/yes/no)",
      });
      return z.NEVER;
    })
    .default(defaultValue);

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    OIDC_PORT: z.coerce.number().int().positive().default(3001),
    OIDC_ISSUER: z.string().url().default("http://localhost:3001"),
    OAUTH_CLIENT_ID: z.string().min(1).default("local-client"),
    OAUTH_CLIENT_SECRET: z.string().min(1).default("local-client-secret"),
    OIDC_CLIENT_REDIRECT_URIS: z
      .string()
      .default("http://localhost:5173/callback")
      .transform((value) =>
        value
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v.length > 0),
      )
      .pipe(z.array(z.string().url()).min(1)),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.ACCESS_TOKEN_TTL_SECONDS),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.REFRESH_TOKEN_TTL_SECONDS),
    ARGON2_MEMORY_COST: z.coerce
      .number()
      .int()
      .min(4096)
      .default(APP_CONSTANTS.ARGON2_MEMORY_COST),
    ARGON2_TIME_COST: z.coerce
      .number()
      .int()
      .min(1)
      .default(APP_CONSTANTS.ARGON2_TIME_COST),
    ARGON2_PARALLELISM: z.coerce
      .number()
      .int()
      .min(1)
      .default(APP_CONSTANTS.ARGON2_PARALLELISM),
    RATE_LIMIT_SIGNUP_PER_MIN: z.coerce
      .number()
      .int()
      .min(1)
      .default(APP_CONSTANTS.RATE_LIMIT_SIGNUP_PER_MIN),
    RATE_LIMIT_LOGIN_PER_MIN: z.coerce
      .number()
      .int()
      .min(1)
      .default(APP_CONSTANTS.RATE_LIMIT_LOGIN_PER_MIN),
    RATE_LIMIT_OAUTH_PER_MIN: z.coerce
      .number()
      .int()
      .min(1)
      .default(APP_CONSTANTS.RATE_LIMIT_OAUTH_PER_MIN),
    RATE_LIMIT_DISCOVERY_PER_MIN: z.coerce
      .number()
      .int()
      .min(1)
      .default(APP_CONSTANTS.RATE_LIMIT_DISCOVERY_PER_MIN),
    MFA_ISSUER: z.string().min(1).default(APP_CONSTANTS.MFA_ISSUER),
    JWKS_ROTATION_INTERVAL_HOURS: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.JWKS_ROTATION_INTERVAL_HOURS),
    JWKS_GRACE_PERIOD_HOURS: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.JWKS_GRACE_PERIOD_HOURS),
    RETENTION_AUDIT_LOG_ANONYMIZE_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.RETENTION_AUDIT_LOG_ANONYMIZE_DAYS),
    RETENTION_AUDIT_LOG_DELETE_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.RETENTION_AUDIT_LOG_DELETE_DAYS),
    RETENTION_SECURITY_EVENT_ANONYMIZE_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.RETENTION_SECURITY_EVENT_ANONYMIZE_DAYS),
    RETENTION_SECURITY_EVENT_DELETE_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.RETENTION_SECURITY_EVENT_DELETE_DAYS),
    RETENTION_SESSION_ANONYMIZE_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.RETENTION_SESSION_ANONYMIZE_DAYS),
    RETENTION_SESSION_DELETE_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.RETENTION_SESSION_DELETE_DAYS),
    RETENTION_BATCH_CHUNK_SIZE: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.RETENTION_BATCH_CHUNK_SIZE),
    RETENTION_JOB_LOCK_KEY: z.coerce
      .number()
      .int()
      .default(APP_CONSTANTS.RETENTION_JOB_LOCK_KEY),
    RETENTION_JOB_ENABLED: envBoolean(true),
    ACCOUNT_DELETION_GRACE_DAYS: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(APP_CONSTANTS.ACCOUNT_DELETION_GRACE_DAYS),
    ACCOUNT_DELETION_JOB_LOCK_KEY: z.coerce
      .number()
      .int()
      .default(APP_CONSTANTS.ACCOUNT_DELETION_JOB_LOCK_KEY),
    ACCOUNT_DELETION_JOB_ENABLED: envBoolean(true),
    RATE_LIMIT_ACCOUNT_DELETE_PER_HOUR: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.RATE_LIMIT_ACCOUNT_DELETE_PER_HOUR),
    RATE_LIMIT_PROFILE_UPDATE_PER_10_MIN: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.RATE_LIMIT_PROFILE_UPDATE_PER_10_MIN),
    MFA_RECOVERY_CODE_PEPPER: z
      .string()
      .min(16)
      .default("dev-mfa-recovery-pepper"),
    MFA_RECOVERY_CODE_COUNT: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.MFA_RECOVERY_CODE_COUNT),
    MFA_RECOVERY_CODE_LENGTH: z.coerce
      .number()
      .int()
      .min(20)
      .default(APP_CONSTANTS.MFA_RECOVERY_CODE_LENGTH),
    RATE_LIMIT_MFA_RECOVERY_PER_MIN: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.RATE_LIMIT_MFA_RECOVERY_PER_MIN),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    ADMIN_SOD_ENFORCED: envBoolean(APP_CONSTANTS.ADMIN_SOD_ENFORCED),
    METRICS_ENABLED: envBoolean(true),
    METRICS_BEARER_TOKEN: z.string().default(""),
    RBAC_CACHE_ENABLED: envBoolean(APP_CONSTANTS.RBAC_CACHE_ENABLED),
    RBAC_CACHE_PERCENT: z.coerce
      .number()
      .int()
      .min(0)
      .max(100)
      .default(APP_CONSTANTS.RBAC_CACHE_PERCENT),
    RBAC_CACHE_AUTH_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.RBAC_CACHE_AUTH_TTL_SECONDS),
    RBAC_CACHE_ENT_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.RBAC_CACHE_ENT_TTL_SECONDS),
    RBAC_CACHE_NEGATIVE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.RBAC_CACHE_NEGATIVE_TTL_SECONDS),
    TURNSTILE_ENABLED: envBoolean(false),
    TURNSTILE_SECRET_KEY: z.string().default(""),
    TURNSTILE_SITE_KEY: z.string().default(""),
    TURNSTILE_VERIFY_URL: z
      .string()
      .url()
      .default("https://challenges.cloudflare.com/turnstile/v0/siteverify"),
    TURNSTILE_REQUIRED_ACTIONS: z
      .string()
      .default("signup,password_reset")
      .transform((value) =>
        value
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v.length > 0),
      )
      .pipe(
        z.array(z.enum(["signup", "password_reset", "login", "google_login"])),
      ),
    TURNSTILE_ENFORCE_LOGIN_MODE: z
      .enum(["off", "risk", "always"])
      .default("risk"),
    TURNSTILE_EXPECTED_HOSTNAME: z.string().default(""),
    BOT_RISK_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.BOT_RISK_WINDOW_SECONDS),
    BOT_RISK_LOGIN_THRESHOLD_PER_WINDOW: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.BOT_RISK_LOGIN_THRESHOLD_PER_WINDOW),
    BOT_RISK_MEDIUM_WATERMARK_PERCENT: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(APP_CONSTANTS.BOT_RISK_MEDIUM_WATERMARK_PERCENT),
    ADAPTIVE_MFA_ENABLED: envBoolean(APP_CONSTANTS.ADAPTIVE_MFA_ENABLED),
    ADAPTIVE_MFA_REQUIRE_FOR_MEDIUM: envBoolean(
      APP_CONSTANTS.ADAPTIVE_MFA_REQUIRE_FOR_MEDIUM,
    ),
    ADAPTIVE_MFA_IP_FAILURE_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.ADAPTIVE_MFA_IP_FAILURE_WINDOW_SECONDS),
    ADAPTIVE_MFA_IP_FAILURE_HIGH_THRESHOLD: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.ADAPTIVE_MFA_IP_FAILURE_HIGH_THRESHOLD),
    ADAPTIVE_MFA_IMPOSSIBLE_TRAVEL_WINDOW_MINUTES: z.coerce
      .number()
      .int()
      .positive()
      .default(APP_CONSTANTS.ADAPTIVE_MFA_IMPOSSIBLE_TRAVEL_WINDOW_MINUTES),
    ADAPTIVE_MFA_HIGH_RISK_IPS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v.length > 0),
      ),
    JWT_PRIVATE_KEY: z.string().min(1),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    OTEL_EXPORTER_OTLP_ENDPOINT: z
      .string()
      .url()
      .default("http://localhost:4318/v1/traces"),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    WEBAUTHN_RP_NAME: z.string().min(1).default("gxp-idProvider"),
    WEBAUTHN_RP_ID: z.string().min(1).default("localhost"),
    WEBAUTHN_ORIGIN: z.string().url().default("http://localhost:3000"),
  })
  .superRefine((env, ctx) => {
    if (
      env.NODE_ENV === "production" &&
      env.JWT_PRIVATE_KEY === "dev-private-key"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "JWT_PRIVATE_KEY must not use the development default in production",
        path: ["JWT_PRIVATE_KEY"],
      });
    }

    if (
      env.NODE_ENV === "production" &&
      env.MFA_RECOVERY_CODE_PEPPER === "dev-mfa-recovery-pepper"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "MFA_RECOVERY_CODE_PEPPER must not use the development default in production",
        path: ["MFA_RECOVERY_CODE_PEPPER"],
      });
    }

    if (
      env.NODE_ENV === "production" &&
      env.METRICS_ENABLED &&
      env.METRICS_BEARER_TOKEN.trim().length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "METRICS_BEARER_TOKEN must be set when METRICS_ENABLED=true in production",
        path: ["METRICS_BEARER_TOKEN"],
      });
    }

    if (env.TURNSTILE_ENABLED && env.TURNSTILE_SECRET_KEY.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TURNSTILE_SECRET_KEY must be set when TURNSTILE_ENABLED=true",
        path: ["TURNSTILE_SECRET_KEY"],
      });
    }

    if (env.TURNSTILE_ENABLED && env.TURNSTILE_SITE_KEY.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "TURNSTILE_SITE_KEY must be set when TURNSTILE_ENABLED=true",
        path: ["TURNSTILE_SITE_KEY"],
      });
    }

    if (
      env.RETENTION_AUDIT_LOG_ANONYMIZE_DAYS >
      env.RETENTION_AUDIT_LOG_DELETE_DAYS
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "RETENTION_AUDIT_LOG_ANONYMIZE_DAYS must be <= RETENTION_AUDIT_LOG_DELETE_DAYS",
        path: ["RETENTION_AUDIT_LOG_ANONYMIZE_DAYS"],
      });
    }

    if (
      env.RETENTION_SECURITY_EVENT_ANONYMIZE_DAYS >
      env.RETENTION_SECURITY_EVENT_DELETE_DAYS
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "RETENTION_SECURITY_EVENT_ANONYMIZE_DAYS must be <= RETENTION_SECURITY_EVENT_DELETE_DAYS",
        path: ["RETENTION_SECURITY_EVENT_ANONYMIZE_DAYS"],
      });
    }

    if (
      env.RETENTION_SESSION_ANONYMIZE_DAYS > env.RETENTION_SESSION_DELETE_DAYS
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "RETENTION_SESSION_ANONYMIZE_DAYS must be <= RETENTION_SESSION_DELETE_DAYS",
        path: ["RETENTION_SESSION_ANONYMIZE_DAYS"],
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export const loadEnv = (rawEnv: Record<string, string | undefined>): AppEnv => {
  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join(", ");
    throw new Error(`Invalid environment variables: ${message}`);
  }
  return parsed.data;
};
