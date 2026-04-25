type Bucket = {
  count: number;
  resetAt: number;
};

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1 };
    }

    if (current.count >= limit) {
      return { allowed: false, remaining: 0 };
    }

    current.count += 1;
    this.buckets.set(key, current);
    return { allowed: true, remaining: Math.max(limit - current.count, 0) };
  }
}
