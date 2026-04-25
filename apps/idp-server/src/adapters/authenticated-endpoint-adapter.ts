import { ApiError } from "@idp/shared";
import type { Context, Env, Input } from "hono";
import type { ZodTypeAny } from "zod";

type AuthContext = {
  userId: string;
  sessionId: string;
};

const authHeaderPrefix = "Bearer ";
const accessTokenCookieName = "idp_access_token";
const csrfTokenCookieName = "idp_csrf_token";

type AuthTokenSource = "bearer" | "cookie";

const parseCookieHeader = (
  cookieHeader: string | undefined,
): Record<string, string> => {
  if (!cookieHeader) return {};
  const pairs = cookieHeader.split(";");
  const cookies: Record<string, string> = {};
  for (const pair of pairs) {
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
};

const getTokenFromRequest = (
  authorization: string | undefined,
  cookieHeader: string | undefined,
): { token: string; source: AuthTokenSource } => {
  if (authorization?.startsWith(authHeaderPrefix)) {
    const token = authorization.slice(authHeaderPrefix.length).trim();
    if (token.length < 16) {
      throw new ApiError(401, "unauthorized", "Invalid bearer token");
    }
    return { token, source: "bearer" };
  }
  const token = parseCookieHeader(cookieHeader)[accessTokenCookieName];
  if (!token || token.length < 16) {
    throw new ApiError(401, "unauthorized", "Missing access token");
  }
  return { token, source: "cookie" };
};

const isSafeMethod = (method: string): boolean =>
  method === "GET" ||
  method === "HEAD" ||
  method === "OPTIONS" ||
  method === "TRACE";

const assertCsrf = (
  method: string,
  source: AuthTokenSource,
  cookieHeader: string | undefined,
  csrfHeader: string | undefined,
) => {
  if (source !== "cookie" || isSafeMethod(method)) {
    return;
  }
  const cookies = parseCookieHeader(cookieHeader);
  const csrfCookie = cookies[csrfTokenCookieName];
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    throw new ApiError(403, "csrf_invalid", "Invalid CSRF token");
  }
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
    const cookieHeader = c.req.header("cookie");
    const authToken = getTokenFromRequest(
      c.req.header("authorization"),
      cookieHeader,
    );
    assertCsrf(
      c.req.method,
      authToken.source,
      cookieHeader,
      c.req.header("x-csrf-token"),
    );
    const auth = await options.authenticate(authToken.token);
    const parsed = options.schema.safeParse(await readPayload(c));

    if (!parsed.success) {
      throw new ApiError(400, "validation_error", parsed.error.message);
    }

    const result = await options.handler(c, parsed.data, auth);
    return c.json(result);
  };
};
