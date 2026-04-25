import { ApiError } from "@idp/shared";
import type { Context } from "hono";

const jsonError = (c: Context, status: number, body: Record<string, unknown>) =>
  c.newResponse(JSON.stringify(body), status as never, {
    "content-type": "application/json",
  });

export const handleError = (error: unknown, c: Context) => {
  const traceId = c.get("traceId") as string | undefined;

  if (error instanceof ApiError) {
    return jsonError(c, error.status, {
      code: error.code,
      message: error.message,
      traceId,
    });
  }

  return jsonError(c, 500, {
    code: "internal_error",
    message: "Internal Server Error",
    traceId,
  });
};
