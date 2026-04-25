import type { ConfigService } from "@idp/auth-core";
import {
  ApiError,
  emailVerificationRequestSchema,
  emptyRequestSchema,
  loginRequestSchema,
  refreshRequestSchema,
  signupRequestSchema,
} from "@idp/shared";
import { Hono } from "hono";
import type pino from "pino";
import { authenticatedEndpointAdapter } from "../../adapters/authenticated-endpoint-adapter.js";
import { publicEndpointAdapter } from "../../adapters/public-endpoint-adapter.js";
import type { AppEnv } from "../../config/env.js";
import type { RateLimiter } from "../../core/rate-limiter.js";
import { createOpaqueToken } from "../../core/tokens.js";
import { clearCookie, serializeCookie } from "../../utils/cookie.js";
import { getIpAddress } from "../../utils/ip-address.js";
import type { AuthService } from "./auth.service.js";

export type AuthRoutesDependencies = {
  authService: AuthService;
  rateLimiter: RateLimiter;
  configService: ConfigService;
  env: AppEnv;
  logger: pino.Logger;
};

export const createAuthRoutes = (deps: AuthRoutesDependencies) => {
  const app = new Hono();
  const secureCookie = deps.env.NODE_ENV === "production";
  const accessTokenMaxAge = deps.env.ACCESS_TOKEN_TTL_SECONDS ?? 900;

  app.post(
    "/v1/signup",
    publicEndpointAdapter({
      schema: signupRequestSchema,
      handler: async (_c, payload) => {
        const result = await deps.authService.signup(
          payload.email,
          payload.password,
          payload.displayName,
        );
        if (!result.ok) throw result.error;
        return { user: result.value.user };
      },
    }),
  );

  app.post(
    "/v1/login",
    publicEndpointAdapter({
      schema: loginRequestSchema,
      handler: async (c, payload) => {
        const ipAddress = getIpAddress(c.req.header("x-forwarded-for"));
        const userAgent = c.req.header("user-agent") || null;
        const result = await deps.authService.login(
          payload.email,
          payload.password,
          ipAddress,
          userAgent,
        );
        if (!result.ok) throw result.error;
        if ("accessToken" in result.value) {
          const csrfToken = createOpaqueToken("csrf");
          c.header(
            "Set-Cookie",
            serializeCookie("idp_access_token", result.value.accessToken, {
              path: "/",
              httpOnly: true,
              secure: secureCookie,
              sameSite: "Lax",
              maxAge: accessTokenMaxAge,
            }),
            { append: true },
          );
          c.header(
            "Set-Cookie",
            serializeCookie("idp_csrf_token", csrfToken, {
              path: "/",
              secure: secureCookie,
              sameSite: "Lax",
              maxAge: accessTokenMaxAge,
            }),
            { append: true },
          );
        }
        return result.value;
      },
    }),
  );

  app.post(
    "/oauth/token",
    publicEndpointAdapter({
      schema: refreshRequestSchema,
      handler: async (_c, payload) => {
        const result = await deps.authService.refresh(payload.refreshToken);
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  app.post(
    "/v1/logout",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate: deps.authService.authenticateAccessToken.bind(
        deps.authService,
      ),
      handler: async (c, _payload, auth) => {
        const result = await deps.authService.logout(auth.sessionId);
        if (!result.ok) throw result.error;
        c.header("Set-Cookie", clearCookie("idp_access_token", secureCookie), {
          append: true,
        });
        c.header("Set-Cookie", clearCookie("idp_csrf_token", secureCookie), {
          append: true,
        });
        return result.value;
      },
    }),
  );

  app.post(
    "/v1/email/verify/request",
    publicEndpointAdapter({
      schema: emailVerificationRequestSchema,
      handler: async (c, payload) => {
        const ipAddress = getIpAddress(c.req.header("x-forwarded-for"));
        const rate = await deps.rateLimiter.consume(
          `email-verify:${payload.email}:${ipAddress ?? "unknown"}`,
          deps.env.RATE_LIMIT_LOGIN_PER_MIN,
          60,
        );
        if (!rate.allowed)
          throw new ApiError(
            429,
            "rate_limited",
            "Too many verification attempts",
          );

        const result = await deps.authService.requestEmailVerification(
          payload.email,
        );
        if (!result.ok) throw result.error;

        if ("token" in result.value && result.value.token) {
          const _template =
            await deps.configService.getEmailTemplateConfig("signup_verify");
          deps.logger.info(
            { event: "email.dispatch.requested", to: payload.email },
            "verification email requested",
          );
        }
        return deps.env.NODE_ENV === "production"
          ? { status: "accepted" }
          : result.value;
      },
    }),
  );

  return app;
};
