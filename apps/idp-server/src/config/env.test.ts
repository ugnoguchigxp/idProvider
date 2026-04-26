import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const baseEnv = {
  NODE_ENV: "test",
  JWT_PRIVATE_KEY: "test-private-key",
  DATABASE_URL: "http://db.example.com",
  REDIS_URL: "http://redis.example.com",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
};

describe("loadEnv", () => {
  it("parses boolean-like false values for retention flags", () => {
    const env = loadEnv({
      ...baseEnv,
      RETENTION_JOB_ENABLED: "false",
      ACCOUNT_DELETION_JOB_ENABLED: "0",
    });

    expect(env.RETENTION_JOB_ENABLED).toBe(false);
    expect(env.ACCOUNT_DELETION_JOB_ENABLED).toBe(false);
  });

  it("parses boolean-like true values for retention flags", () => {
    const env = loadEnv({
      ...baseEnv,
      RETENTION_JOB_ENABLED: "yes",
      ACCOUNT_DELETION_JOB_ENABLED: "1",
    });

    expect(env.RETENTION_JOB_ENABLED).toBe(true);
    expect(env.ACCOUNT_DELETION_JOB_ENABLED).toBe(true);
  });

  it("rejects invalid boolean values", () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        RETENTION_JOB_ENABLED: "not-bool",
      }),
    ).toThrow(/RETENTION_JOB_ENABLED/);
  });

  it("requires metrics token in production when metrics are enabled", () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        NODE_ENV: "production",
        METRICS_ENABLED: "true",
        METRICS_BEARER_TOKEN: "",
      }),
    ).toThrow(/METRICS_BEARER_TOKEN/);
  });

  it("requires turnstile keys when enabled", () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        TURNSTILE_ENABLED: "true",
        TURNSTILE_SECRET_KEY: "",
        TURNSTILE_SITE_KEY: "",
      }),
    ).toThrow(/TURNSTILE_SECRET_KEY/);
  });
});
