import type { MiddlewareHandler } from "hono";
import { observeHttpRequest } from "../core/metrics.js";

export const httpMetricsMiddleware: MiddlewareHandler = async (c, next) => {
  const start = process.hrtime.bigint();
  try {
    await next();
  } finally {
    const durationNs = process.hrtime.bigint() - start;
    observeHttpRequest({
      method: c.req.method,
      path: c.req.path,
      statusCode: c.res.status,
      durationSeconds: Number(durationNs) / 1_000_000_000,
    });
  }
};
