import { Redis } from "ioredis";

export type RedisClient = Redis;

export const createRedisClient = (url: string): RedisClient => {
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  client.on("error", (err) => {
    console.error("Redis error:", err);
  });

  return client;
};
