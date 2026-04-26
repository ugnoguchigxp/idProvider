import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../config/env.js";
import { createRuntime } from "./create-runtime.js";

vi.mock("@idp/db", () => {
  return {
    createDb: vi.fn(() => ({
      db: {},
      pool: { end: vi.fn() },
    })),
  };
});

vi.mock("@idp/auth-core", () => {
  return {
    createRedisClient: vi.fn(() => ({})),
    ConfigService: vi.fn().mockImplementation(() => ({})),
    KeyStoreService: vi.fn().mockImplementation(() => ({})),
    WebAuthnService: vi.fn().mockImplementation(() => ({})),
  };
});

vi.mock("../core/logger.js", () => {
  return {
    createLogger: vi.fn(() => ({})),
  };
});

vi.mock("../core/metrics.js", () => {
  return {
    markDependencyUp: vi.fn(),
  };
});

vi.mock("../core/security-notifier.js", () => {
  return {
    createSecurityNotifier: vi.fn(() => vi.fn()),
  };
});

vi.mock("../core/rate-limiter.js", () => {
  return {
    RateLimiter: vi.fn().mockImplementation(() => ({})),
  };
});

describe("composition", () => {
  it("createRuntime initializes all dependencies without throwing", () => {
    const mockEnv = {
      LOG_LEVEL: "info",
      DATABASE_URL: "postgres://mock",
      REDIS_URL: "redis://mock",
      JWKS_ROTATION_INTERVAL_HOURS: 24,
      JWKS_GRACE_PERIOD_HOURS: 1,
    } as AppEnv;

    const runtime = createRuntime(mockEnv);
    expect(runtime).toBeDefined();
    expect(runtime.db).toBeDefined();
    expect(runtime.redis).toBeDefined();
    expect(runtime.logger).toBeDefined();
    expect(runtime.services).toBeDefined();
    expect(runtime.repositories).toBeDefined();
    expect(runtime.appDependencies).toBeDefined();
  });
});
