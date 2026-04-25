import { beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../core/rate-limiter.js";

describe("RateLimiter", () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter();
    vi.useFakeTimers();
  });

  it("allows requests within limit", async () => {
    const res1 = await rateLimiter.consume("test", 2, 60);
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(1);

    const res2 = await rateLimiter.consume("test", 2, 60);
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(0);

    const res3 = await rateLimiter.consume("test", 2, 60);
    expect(res3.allowed).toBe(false);
    expect(res3.remaining).toBe(0);
  });

  it("resets after window", async () => {
    await rateLimiter.consume("test", 1, 60);
    const res1 = await rateLimiter.consume("test", 1, 60);
    expect(res1.allowed).toBe(false);

    vi.advanceTimersByTime(61 * 1000);

    const res2 = await rateLimiter.consume("test", 1, 60);
    expect(res2.allowed).toBe(true);
  });
});
