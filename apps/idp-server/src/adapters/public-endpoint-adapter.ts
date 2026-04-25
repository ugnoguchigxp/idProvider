import { ApiError } from "@idp/shared";
import type { Context, Env, Input } from "hono";
import type { ZodTypeAny } from "zod";

const readPayload = async (c: Context): Promise<unknown> => {
  if (c.req.method === "GET" || c.req.method === "HEAD") {
    return {};
  }
  return c.req.json().catch(() => ({}));
};

export const publicEndpointAdapter = <
  TSchema extends ZodTypeAny,
  TResult,
>(options: {
  schema: TSchema;
  handler: (c: Context, payload: TSchema["_output"]) => Promise<TResult>;
}) => {
  return async (c: Context<Env, string, Input>) => {
    const parsed = options.schema.safeParse(await readPayload(c));

    if (!parsed.success) {
      throw new ApiError(400, "validation_error", parsed.error.message);
    }

    const result = await options.handler(c, parsed.data);
    return c.json(result);
  };
};
