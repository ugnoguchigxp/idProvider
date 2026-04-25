import { randomUUID } from "node:crypto";
import {
  ApiError,
  emailVerificationConfirmSchema,
  emailVerificationRequestSchema,
  googleLoginRequestSchema,
  loginRequestSchema,
  passwordResetConfirmRequestSchema,
  passwordResetRequestSchema,
  refreshRequestSchema,
  signupRequestSchema,
  webauthnAuthenticationOptionsSchema,
  webauthnAuthenticationVerifySchema,
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

const renderTemplate = (
  template: { subject: string; body: string },
  variables: Record<string, string>,
) => {
  const replace = (source: string) =>
    source.replace(
      /\{\{(\w+)\}\}/g,
      (_match, key: string) => variables[key] ?? "",
    );
  return {
    subject: replace(template.subject),
    body: replace(template.body),
  };
};

export const buildPublicRoutes = (deps: AppDependencies) => {
  const app = new Hono();

  app.post(
    "/v1/mfa/webauthn/authenticate/options",
    publicEndpointAdapter({
      schema: webauthnAuthenticationOptionsSchema,
      handler: async (c, payload) => {
        const ipAddress = getIpAddress(c.req.header("x-forwarded-for"));
        const rate = await deps.rateLimiter.consume(
          `webauthn:options:${payload.email}:${ipAddress ?? "unknown"}`,
          deps.env.RATE_LIMIT_LOGIN_PER_MIN,
          60,
        );
        if (!rate.allowed) {
          throw new ApiError(
            429,
            "rate_limited",
            "Too many authentication attempts",
          );
        }

        const user = await deps.authService.getUserByEmail(payload.email);
        return deps.webauthnService.generateAuthenticationOptions(
          user?.id ?? randomUUID(),
        );
      },
    }),
  );

  app.post(
    "/v1/mfa/webauthn/authenticate/verify",
    publicEndpointAdapter({
      schema: webauthnAuthenticationVerifySchema,
      handler: async (c, payload) => {
        const ipAddress = getIpAddress(c.req.header("x-forwarded-for"));
        const rate = await deps.rateLimiter.consume(
          `webauthn:verify:${payload.email}:${ipAddress ?? "unknown"}`,
          deps.env.RATE_LIMIT_LOGIN_PER_MIN,
          60,
        );
        if (!rate.allowed) {
          throw new ApiError(
            429,
            "rate_limited",
            "Too many authentication attempts",
          );
        }

        const user = await deps.authService.getUserByEmail(payload.email);
        if (!user) {
          throw new ApiError(
            401,
            "invalid_credentials",
            "Invalid authentication request",
          );
        }

        const userAgent = c.req.header("user-agent") ?? null;

        try {
          await deps.webauthnService.verifyAuthenticationResponse(
            user.id,
            payload.response,
          );
        } catch (_error: unknown) {
          throw new ApiError(
            401,
            "invalid_credentials",
            "Invalid authentication request",
          );
        }

        // WebAuthn authentication successful, now create a session
        const tokens = await deps.authService.createSessionForUser(
          user.id,
          ipAddress,
          userAgent,
        );

        return {
          status: "ok",
          userId: user.id,
          mfaEnabled: true,
          ...tokens,
        };
      },
    }),
  );

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

        const template =
          await deps.configService.getEmailTemplateConfig("signup_verify");
        const message = renderTemplate(template, {
          email: result.email,
          token: result.verificationToken,
        });
        deps.logger.info(
          {
            event: "email.dispatch.requested",
            type: "signup_verify",
            to: result.email,
            subject: message.subject,
          },
          "signup verification email dispatch requested",
        );

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
          ...(payload.mfaCode ? { mfaCode: payload.mfaCode } : {}),
          ...(payload.mfaFactorId ? { mfaFactorId: payload.mfaFactorId } : {}),
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
    "/v1/login/google",
    publicEndpointAdapter({
      schema: googleLoginRequestSchema,
      handler: async (c, payload) => {
        const googleConfig =
          await deps.configService.getSocialLoginConfig("google");
        if (!googleConfig.providerEnabled) {
          throw new ApiError(
            403,
            "google_login_disabled",
            "Google login is currently disabled",
          );
        }

        const ipAddress = getIpAddress(c.req.header("x-forwarded-for"));
        const userAgent = c.req.header("user-agent") ?? null;

        const result = await deps.authService.loginWithGoogle({
          idToken: payload.idToken,
          clientId: googleConfig.clientId,
          ...(payload.mfaCode ? { mfaCode: payload.mfaCode } : {}),
          ...(payload.mfaFactorId ? { mfaFactorId: payload.mfaFactorId } : {}),
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
      handler: async (c, payload) => {
        const ipAddress = getIpAddress(c.req.header("x-forwarded-for"));
        const rate = await deps.rateLimiter.consume(
          `email-verify:${payload.email}:${ipAddress ?? "unknown"}`,
          deps.env.RATE_LIMIT_LOGIN_PER_MIN,
          60,
        );
        if (!rate.allowed) {
          throw new ApiError(
            429,
            "rate_limited",
            "Too many verification attempts",
          );
        }

        const result = await deps.authService.requestEmailVerification(
          payload.email,
        );
        if (result.token) {
          const template =
            await deps.configService.getEmailTemplateConfig("signup_verify");
          const message = renderTemplate(template, {
            email: payload.email,
            token: result.token,
          });
          deps.logger.info(
            {
              event: "email.dispatch.requested",
              type: "signup_verify",
              to: payload.email,
              subject: message.subject,
            },
            "email verification dispatch requested",
          );
        }
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
      handler: async (c, payload) => {
        const ipAddress = getIpAddress(c.req.header("x-forwarded-for"));
        const rate = await deps.rateLimiter.consume(
          `password-reset:${payload.email}:${ipAddress ?? "unknown"}`,
          deps.env.RATE_LIMIT_LOGIN_PER_MIN,
          60,
        );
        if (!rate.allowed) {
          throw new ApiError(
            429,
            "rate_limited",
            "Too many password reset attempts",
          );
        }

        const result = await deps.authService.requestPasswordReset(
          payload.email,
        );
        const template =
          await deps.configService.getEmailTemplateConfig("password_reset");
        const token =
          "token" in result && typeof result.token === "string"
            ? result.token
            : "";
        const message = renderTemplate(template, {
          email: payload.email,
          token,
        });
        deps.logger.info(
          {
            event: "email.dispatch.requested",
            type: "password_reset",
            to: payload.email,
            subject: message.subject,
          },
          "password reset dispatch requested",
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
