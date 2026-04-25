import { describe, expect, it } from "vitest";
import { loadEnv } from "../config/env.js";

const baseEnv = {
  NODE_ENV: "test",
  PORT: "3000",
  OIDC_PORT: "3001",
  OIDC_ISSUER: "http://localhost:3001",
  OAUTH_CLIENT_ID: "local-client",
  OAUTH_CLIENT_SECRET: "local-client-secret",
  ACCESS_TOKEN_TTL_SECONDS: "900",
  REFRESH_TOKEN_TTL_SECONDS: "2592000",
  ARGON2_MEMORY_COST: "19456",
  ARGON2_TIME_COST: "2",
  ARGON2_PARALLELISM: "1",
  RATE_LIMIT_SIGNUP_PER_MIN: "10",
  RATE_LIMIT_LOGIN_PER_MIN: "20",
  MFA_ISSUER: "gxp-idProvider",
  JWKS_ROTATION_INTERVAL_HOURS: "720",
  JWKS_GRACE_PERIOD_HOURS: "72",
  RETENTION_AUDIT_LOG_ANONYMIZE_DAYS: "365",
  RETENTION_AUDIT_LOG_DELETE_DAYS: "2555",
  RETENTION_SECURITY_EVENT_ANONYMIZE_DAYS: "90",
  RETENTION_SECURITY_EVENT_DELETE_DAYS: "365",
  RETENTION_SESSION_ANONYMIZE_DAYS: "30",
  RETENTION_SESSION_DELETE_DAYS: "90",
  RETENTION_BATCH_CHUNK_SIZE: "500",
  RETENTION_JOB_LOCK_KEY: "91000101",
  LOG_LEVEL: "info",
  JWT_PRIVATE_KEY: "test-private-key",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/idp",
  REDIS_URL: "redis://localhost:6379",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
};

describe("loadEnv retention validation", () => {
  it("loads retention values", () => {
    const env = loadEnv(baseEnv);
    expect(env.RETENTION_AUDIT_LOG_DELETE_DAYS).toBe(2555);
    expect(env.RETENTION_BATCH_CHUNK_SIZE).toBe(500);
  });

  it("throws when anonymize days exceed delete days", () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        RETENTION_SESSION_ANONYMIZE_DAYS: "120",
        RETENTION_SESSION_DELETE_DAYS: "90",
      }),
    ).toThrow(/RETENTION_SESSION_ANONYMIZE_DAYS/);
  });
});
