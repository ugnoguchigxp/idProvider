import { ApiError } from "@idp/shared";
import type { Context, Env, Input } from "hono";
import type { ZodTypeAny } from "zod";

type AuthContext = {
  userId: string;
  sessionId: string;
};

const authHeaderPrefix = "Bearer ";

const getTokenFromAuthorization = (
  authorization: string | undefined,
): string => {
  if (!authorization?.startsWith(authHeaderPrefix)) {
    throw new ApiError(401, "unauthorized", "Missing bearer token");
  }

  const token = authorization.slice(authHeaderPrefix.length).trim();
  if (token.length < 16) {
    throw new ApiError(401, "unauthorized", "Invalid bearer token");
  }

  return token;
};

const readPayload = async (c: Context): Promise<unknown> => {
  if (c.req.method === "GET" || c.req.method === "HEAD") {
    return {};
  }
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return c.req.json().catch(() => ({}));
  }
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const body = await c.req.parseBody();
    return Object.fromEntries(Object.entries(body));
  }
  return c.req.json().catch(() => ({}));
};

export const authenticatedEndpointAdapter = <
  TSchema extends ZodTypeAny,
  TResult,
>(options: {
  schema: TSchema;
  authenticate: (accessToken: string) => Promise<AuthContext>;
  handler: (
    c: Context,
    payload: TSchema["_output"],
    auth: AuthContext,
  ) => Promise<TResult>;
}) => {
  return async (c: Context<Env, string, Input>) => {
    const accessToken = getTokenFromAuthorization(
      c.req.header("authorization"),
    );
    const auth = await options.authenticate(accessToken);
    const parsed = options.schema.safeParse(await readPayload(c));

    if (!parsed.success) {
      throw new ApiError(400, "validation_error", parsed.error.message);
    }

    const result = await options.handler(c, parsed.data, auth);
    return c.json(result);
  };
};
