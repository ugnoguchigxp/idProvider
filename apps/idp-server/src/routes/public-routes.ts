import {
  ApiError,
  emailVerificationConfirmSchema,
  emailVerificationRequestSchema,
  loginRequestSchema,
  passwordResetConfirmRequestSchema,
  passwordResetRequestSchema,
  refreshRequestSchema,
  signupRequestSchema,
} from "@idp/shared";
import { Hono } from "hono";
import { publicEndpointAdapter } from "../adapters/public-endpoint-adapter.js";
import type { AppDependencies } from "../core/app-context.js";
import { assertOAuthClientAuth } from "../core/oauth-client-auth.js";

const getIpAddress = (header: string | undefined): string | null => {
  if (!header) {
    return null;
  }

  const first = header.split(",")[0]?.trim();
  return first ?? null;
};

export const buildPublicRoutes = (deps: AppDependencies) => {
  const app = new Hono();

  app.post(
    "/v1/signup",
    publicEndpointAdapter({
      schema: signupRequestSchema,
      handler: async (c, payload) => {
        const ipAddress = getIpAddress(c.req.header("x-forwarded-for"));
        const rate = await deps.rateLimiter.consume(
          `signup:${payload.email}:${ipAddress ?? "unknown"}`,
          deps.env.RATE_LIMIT_SIGNUP_PER_MIN,
          60,
        );
        if (!rate.allowed) {
          throw new ApiError(429, "rate_limited", "Too many signup attempts");
        }

        const result = await deps.authService.signup({
          email: payload.email,
          password: payload.password,
          displayName: payload.displayName,
          ipAddress,
        });

        return {
          status: "accepted",
          user: {
            userId: result.userId,
            email: result.email,
          },
          verification:
            deps.env.NODE_ENV === "production"
              ? { required: true }
              : { required: true, token: result.verificationToken },
        };
      },
    }),
  );

  app.post(
    "/v1/login",
    publicEndpointAdapter({
      schema: loginRequestSchema,
      handler: async (c, payload) => {
        const ipAddress = getIpAddress(c.req.header("x-forwarded-for"));
        const userAgent = c.req.header("user-agent") ?? null;
        const rate = await deps.rateLimiter.consume(
          `login:${payload.email}:${ipAddress ?? "unknown"}`,
          deps.env.RATE_LIMIT_LOGIN_PER_MIN,
          60,
        );
        if (!rate.allowed) {
          throw new ApiError(429, "rate_limited", "Too many login attempts");
        }

        const result = await deps.authService.login({
          email: payload.email,
          password: payload.password,
          ipAddress,
          userAgent,
        });

        return {
          status: "ok",
          ...result,
        };
      },
    }),
  );

  app.post(
    "/oauth/token",
    publicEndpointAdapter({
      schema: refreshRequestSchema,
      handler: async (c, payload) => {
        assertOAuthClientAuth(c.req.header("authorization"), {
          clientId: deps.env.OAUTH_CLIENT_ID,
          clientSecret: deps.env.OAUTH_CLIENT_SECRET,
        });

        const result = await deps.authService.refresh(payload.refreshToken);
        return {
          token_type: "Bearer",
          access_token: result.accessToken,
          refresh_token: result.refreshToken,
          expires_in: deps.env.ACCESS_TOKEN_TTL_SECONDS,
        };
      },
    }),
  );

  app.post(
    "/v1/email/verify/request",
    publicEndpointAdapter({
      schema: emailVerificationRequestSchema,
      handler: async (_c, payload) => {
        const result = await deps.authService.requestEmailVerification(
          payload.email,
        );
        return deps.env.NODE_ENV === "production"
          ? { status: "accepted" }
          : { status: "accepted", token: result.token ?? null };
      },
    }),
  );

  app.post(
    "/v1/email/verify/confirm",
    publicEndpointAdapter({
      schema: emailVerificationConfirmSchema,
      handler: async (_c, payload) => {
        await deps.authService.confirmEmailVerification(payload.token);
        return { status: "ok" };
      },
    }),
  );

  app.post(
    "/v1/password/reset/request",
    publicEndpointAdapter({
      schema: passwordResetRequestSchema,
      handler: async (_c, payload) => {
        const result = await deps.authService.requestPasswordReset(
          payload.email,
        );
        return deps.env.NODE_ENV === "production"
          ? { status: "accepted" }
          : { status: "accepted", ...result };
      },
    }),
  );

  app.post(
    "/v1/password/reset/confirm",
    publicEndpointAdapter({
      schema: passwordResetConfirmRequestSchema,
      handler: async (_c, payload) => {
        await deps.authService.confirmPasswordReset({
          resetToken: payload.resetToken,
          newPassword: payload.newPassword,
        });
        return { status: "ok" };
      },
    }),
  );

  app.get("/healthz", (c) => c.json({ ok: true }));
  app.get("/readyz", (c) => c.json({ ready: true }));

  return app;
};
