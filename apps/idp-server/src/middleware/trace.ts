import type { MiddlewareHandler } from "hono";

const traceHeader = "x-trace-id";

export const traceMiddleware: MiddlewareHandler = async (c, next) => {
  const traceId = c.req.header(traceHeader) ?? crypto.randomUUID();
  c.set("traceId", traceId);
  c.header(traceHeader, traceId);
  await next();
};
