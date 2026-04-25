import { trace } from "@opentelemetry/api";
import type { MiddlewareHandler } from "hono";

const traceHeader = "x-trace-id";

export const traceMiddleware: MiddlewareHandler = async (c, next) => {
  const span = trace.getActiveSpan();
  const traceId = span?.spanContext().traceId ?? crypto.randomUUID();

  c.set("traceId", traceId);
  c.header(traceHeader, traceId);

  await next();
};
