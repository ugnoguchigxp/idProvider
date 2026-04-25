import { describe, expect, it, vi } from "vitest";
import { RateLimiter } from "./rate-limiter.js";

describe("RateLimiter", () => {
  it("should allow request if under limit", async () => {
    const redis: any = {
      eval: vi.fn().mockResolvedValue(1),
    };
    const limiter = new RateLimiter(redis);

    const result = await limiter.consume("user1", 10, 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("should deny request if over limit", async () => {
    const redis: any = {
      eval: vi.fn().mockResolvedValue(11),
    };
    const limiter = new RateLimiter(redis);

    const result = await limiter.consume("user1", 10, 60);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});
