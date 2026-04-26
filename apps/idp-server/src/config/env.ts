import { z } from "zod";

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
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(2_592_000),
    ARGON2_MEMORY_COST: z.coerce.number().int().min(4096).default(19456),
    ARGON2_TIME_COST: z.coerce.number().int().min(1).default(2),
    ARGON2_PARALLELISM: z.coerce.number().int().min(1).default(1),
    RATE_LIMIT_SIGNUP_PER_MIN: z.coerce.number().int().min(1).default(10),
    RATE_LIMIT_LOGIN_PER_MIN: z.coerce.number().int().min(1).default(20),
    RATE_LIMIT_OAUTH_PER_MIN: z.coerce.number().int().min(1).default(60),
    RATE_LIMIT_DISCOVERY_PER_MIN: z.coerce.number().int().min(1).default(120),
    MFA_ISSUER: z.string().min(1).default("gxp-idProvider"),
    JWKS_ROTATION_INTERVAL_HOURS: z.coerce
      .number()
      .int()
      .positive()
      .default(720),
    JWKS_GRACE_PERIOD_HOURS: z.coerce.number().int().positive().default(72),
    RETENTION_AUDIT_LOG_ANONYMIZE_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(365),
    RETENTION_AUDIT_LOG_DELETE_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(2555),
    RETENTION_SECURITY_EVENT_ANONYMIZE_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(90),
    RETENTION_SECURITY_EVENT_DELETE_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(365),
    RETENTION_SESSION_ANONYMIZE_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(30),
    RETENTION_SESSION_DELETE_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(90),
    RETENTION_BATCH_CHUNK_SIZE: z.coerce.number().int().positive().default(500),
    RETENTION_JOB_LOCK_KEY: z.coerce.number().int().default(91_000_101),
    RETENTION_JOB_ENABLED: envBoolean(true),
    ACCOUNT_DELETION_GRACE_DAYS: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(30),
    ACCOUNT_DELETION_JOB_LOCK_KEY: z.coerce.number().int().default(91_000_102),
    ACCOUNT_DELETION_JOB_ENABLED: envBoolean(true),
    RATE_LIMIT_ACCOUNT_DELETE_PER_HOUR: z.coerce
      .number()
      .int()
      .positive()
      .default(3),
    RATE_LIMIT_PROFILE_UPDATE_PER_10_MIN: z.coerce
      .number()
      .int()
      .positive()
      .default(30),
    MFA_RECOVERY_CODE_PEPPER: z
      .string()
      .min(16)
      .default("dev-mfa-recovery-pepper"),
    MFA_RECOVERY_CODE_COUNT: z.coerce.number().int().positive().default(10),
    MFA_RECOVERY_CODE_LENGTH: z.coerce.number().int().min(20).default(20),
    RATE_LIMIT_MFA_RECOVERY_PER_MIN: z.coerce
      .number()
      .int()
      .positive()
      .default(5),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    ADMIN_SOD_ENFORCED: envBoolean(false),
    METRICS_ENABLED: envBoolean(true),
    METRICS_BEARER_TOKEN: z.string().default(""),
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
    BOT_RISK_WINDOW_SECONDS: z.coerce.number().int().positive().default(600),
    BOT_RISK_LOGIN_THRESHOLD_PER_WINDOW: z.coerce
      .number()
      .int()
      .positive()
      .default(20),
    BOT_RISK_MEDIUM_WATERMARK_PERCENT: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20),
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
