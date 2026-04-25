import type { RedisClient } from "@idp/auth-core";

export class RateLimiter {
  constructor(private readonly redis: RedisClient) {}

  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const fullKey = `rl:${key}`;

    // Atomic INCR + EXPIRE if new
    const script = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      return current
    `;

    const result = await this.redis.eval(script, 1, fullKey, windowSeconds);
    const count = typeof result === "number" ? result : 1;

    if (count > limit) {
      return { allowed: false, remaining: 0 };
    }

    return { allowed: true, remaining: Math.max(limit - count, 0) };
  }
}
