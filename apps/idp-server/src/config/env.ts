import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  OIDC_PORT: z.coerce.number().int().positive().default(3001),
  OIDC_ISSUER: z.string().url().default("http://localhost:3001"),
  OAUTH_CLIENT_ID: z.string().min(1).default("local-client"),
  OAUTH_CLIENT_SECRET: z.string().min(1).default("local-client-secret"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  JWT_PRIVATE_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
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
