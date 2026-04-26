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
    RETENTION_JOB_ENABLED: envBoolean(true),
    ACCOUNT_DELETION_JOB_ENABLED: envBoolean(true),
    MFA_RECOVERY_CODE_PEPPER: z
      .string()
      .min(16)
      .default("dev-mfa-recovery-pepper"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
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
  });

export type AppEnv = z.infer<typeof envSchema> & typeof APP_CONSTANTS;

export const loadEnv = (rawEnv: Record<string, string | undefined>): AppEnv => {
  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join(", ");
    throw new Error(`Invalid environment variables: ${message}`);
  }
  return { ...APP_CONSTANTS, ...parsed.data };
};
