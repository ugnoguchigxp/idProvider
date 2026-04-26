import { randomUUID } from "node:crypto";
import type { ConfigService } from "@idp/auth-core";
import {
  ApiError,
  emailVerificationConfirmSchema,
  emailVerificationRequestSchema,
  emptyRequestSchema,
  googleLoginRequestSchema,
  loginRequestSchema,
  oauthIntrospectionRequestSchema,
  passwordResetConfirmRequestSchema,
  passwordResetRequestSchema,
  refreshRequestSchema,
  signupRequestSchema,
} from "@idp/shared";
import { type Context, Hono } from "hono";
import type pino from "pino";
import { authenticatedEndpointAdapter } from "../../adapters/authenticated-endpoint-adapter.js";
import { publicEndpointAdapter } from "../../adapters/public-endpoint-adapter.js";
import type { AppEnv } from "../../config/env.js";
import {
  recordBotBlock,
  recordBotChallengeResult,
} from "../../core/metrics.js";
import type { RateLimiter } from "../../core/rate-limiter.js";
import { createOpaqueToken } from "../../core/tokens.js";
import { verifyTurnstileToken } from "../../core/turnstile.js";
import { clearCookie, serializeCookie } from "../../utils/cookie.js";
import { getIpAddress } from "../../utils/ip-address.js";
import type { OAuthClientService } from "../oauth-clients/oauth-client.service.js";
import type { AuthService } from "./auth.service.js";

export type AuthRoutesDependencies = {
  authService: AuthService;
  rateLimiter: RateLimiter;
  configService: ConfigService;
  env: AppEnv;
  logger: pino.Logger;
  oauthClientService: OAuthClientService;
};

export const createAuthRoutes = (deps: AuthRoutesDependencies) => {
  const app = new Hono();
  const requiredChallengeActions = new Set(
    deps.env.TURNSTILE_REQUIRED_ACTIONS ?? [],
  );
  const secureCookie = deps.env.NODE_ENV === "production";
  const accessTokenMaxAge = deps.env.ACCESS_TOKEN_TTL_SECONDS ?? 900;
  const botChallengeEnabled = deps.env.TURNSTILE_ENABLED ?? false;

  const getLoginRiskLevel = async (input: {
    endpoint: "login" | "google_login";
    email?: string;
    ipAddress: string | null;
    userAgent: string | null;
  }) => {
    if (typeof deps.authService.assessBotRiskForLogin !== "function") {
      return "low" as const;
    }
    return deps.authService.assessBotRiskForLogin(input);
  };

  const recordBotEvent = async (
    eventType: string,
    payload: Record<string, unknown>,
  ) => {
    if (typeof deps.authService.recordSecurityEvent !== "function") {
      return;
    }
    await deps.authService.recordSecurityEvent(eventType, null, payload);
  };

  const verifyChallengeOrThrow = async (input: {
    endpoint: "signup" | "login" | "google_login" | "password_reset";
    action: "signup" | "login" | "google_login" | "password_reset";
    ipAddress: string | null;
    token: string | undefined;
    failOpenOnProviderError: boolean;
  }) => {
    if (!botChallengeEnabled) {
      return;
    }

    if (!input.token) {
      recordBotChallengeResult({ endpoint: input.endpoint, result: "missing" });
      recordBotBlock(input.endpoint);
      await recordBotEvent("bot.challenge.missing", {
        endpoint: input.endpoint,
        action: input.action,
        ipAddress: input.ipAddress,
      });
      throw new ApiError(
        400,
        "challenge_required",
        "Bot challenge token is required",
      );
    }

    try {
      const verification = await verifyTurnstileToken({
        verifyUrl: deps.env.TURNSTILE_VERIFY_URL,
        secretKey: deps.env.TURNSTILE_SECRET_KEY,
        token: input.token,
        remoteIp: input.ipAddress,
        idempotencyKey: randomUUID(),
      });
      const hostnameOk =
        deps.env.TURNSTILE_EXPECTED_HOSTNAME.trim().length === 0 ||
        verification.hostname === deps.env.TURNSTILE_EXPECTED_HOSTNAME;
      const actionOk = verification.action === input.action;

      if (!verification.ok || !actionOk || !hostnameOk) {
        recordBotChallengeResult({
          endpoint: input.endpoint,
          result: "failed",
        });
        recordBotBlock(input.endpoint);
        await recordBotEvent("bot.challenge.invalid", {
          endpoint: input.endpoint,
          action: input.action,
          ipAddress: input.ipAddress,
          verifiedAction: verification.action ?? null,
          hostname: verification.hostname ?? null,
          errorCodes: verification.errorCodes,
          actionOk,
          hostnameOk,
        });
        throw new ApiError(
          401,
          "invalid_challenge",
          "Invalid bot challenge token",
        );
      }

      recordBotChallengeResult({ endpoint: input.endpoint, result: "passed" });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      recordBotChallengeResult({ endpoint: input.endpoint, result: "error" });
      await recordBotEvent("bot.challenge.provider_error", {
        endpoint: input.endpoint,
        action: input.action,
        ipAddress: input.ipAddress,
        error: String(error),
      });
      if (!input.failOpenOnProviderError) {
        recordBotBlock(input.endpoint);
        throw new ApiError(
          503,
          "challenge_provider_unavailable",
          "Bot challenge verification is temporarily unavailable",
        );
      }
      deps.logger.warn(
        { endpoint: input.endpoint, error },
        "turnstile verification failed; fail-open applied",
      );
    }
  };
  const setAuthCookies = (c: Context, accessToken: string) => {
    const csrfToken = createOpaqueToken("csrf");
    c.header(
      "Set-Cookie",
      serializeCookie("idp_access_token", accessToken, {
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
  };
  const toOAuthTokenResponse = (value: {
    accessToken: string;
    refreshToken: string;
    accessExpiresAt: string;
  }) => ({
    token_type: "Bearer" as const,
    access_token: value.accessToken,
    refresh_token: value.refreshToken,
    expires_in: Math.max(
      1,
      Math.floor((Date.parse(value.accessExpiresAt) - Date.now()) / 1000),
    ),
  });
  const toSignupResponse = (
    payload: { email: string },
    value: { user: { id: string }; verificationToken: string },
  ) => ({
    status: "accepted" as const,
    user: {
      userId: value.user.id,
      email: payload.email,
    },
    verification:
      deps.env.NODE_ENV === "production"
        ? { required: true as const }
        : { required: true as const, token: value.verificationToken },
  });

  app.post(
    "/v1/signup",
    publicEndpointAdapter({
      schema: signupRequestSchema,
      handler: async (c, payload) => {
        const ipAddress = getIpAddress(c.req.header("x-forwarded-for"));
        const rate = await deps.rateLimiter.consume(
          `signup:${ipAddress ?? "unknown"}`,
          deps.env.RATE_LIMIT_SIGNUP_PER_MIN,
          60,
        );
        if (!rate.allowed) {
          throw new ApiError(429, "rate_limited", "Too many signup attempts");
        }
        const requireChallenge = requiredChallengeActions.has("signup");
        if (requireChallenge) {
          await verifyChallengeOrThrow({
            endpoint: "signup",
            action: "signup",
            ipAddress,
            token: payload.challengeToken,
            failOpenOnProviderError: false,
          });
        }

        const result = await deps.authService.signup(
          payload.email,
          payload.password,
          payload.displayName,
        );
        if (!result.ok) throw result.error;
        return toSignupResponse(payload, result.value);
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
        const rate = await deps.rateLimiter.consume(
          `login:${payload.email}:${ipAddress ?? "unknown"}`,
          deps.env.RATE_LIMIT_LOGIN_PER_MIN,
          60,
        );
        if (!rate.allowed) {
          throw new ApiError(429, "rate_limited", "Too many login attempts");
        }
        const riskLevel = await getLoginRiskLevel({
          endpoint: "login",
          email: payload.email,
          ipAddress,
          userAgent,
        });
        if (riskLevel === "high") {
          recordBotBlock("login");
          await recordBotEvent("bot.risk.blocked", {
            endpoint: "login",
            ipAddress,
            email: payload.email,
          });
          throw new ApiError(
            403,
            "bot_risk_blocked",
            "Request blocked by bot risk policy",
          );
        }

        const loginMode = deps.env.TURNSTILE_ENFORCE_LOGIN_MODE ?? "risk";
        const requireChallenge =
          loginMode === "always" ||
          (loginMode === "risk" && riskLevel === "medium");
        if (requireChallenge) {
          await verifyChallengeOrThrow({
            endpoint: "login",
            action: "login",
            ipAddress,
            token: payload.challengeToken,
            failOpenOnProviderError: true,
          });
        }

        const result = await deps.authService.login(
          payload.email,
          payload.password,
          ipAddress,
          userAgent,
          {
            mfaCode: payload.mfaCode,
            mfaFactorId: payload.mfaFactorId,
            mfaRecoveryCode: payload.mfaRecoveryCode,
          },
        );
        if (!result.ok) throw result.error;
        if ("accessToken" in result.value) {
          setAuthCookies(c, result.value.accessToken);
        }
        return result.value;
      },
    }),
  );

  app.post(
    "/v1/login/google",
    publicEndpointAdapter({
      schema: googleLoginRequestSchema,
      handler: async (c, payload) => {
        const ipAddress = getIpAddress(c.req.header("x-forwarded-for"));
        const userAgent = c.req.header("user-agent") || null;
        const rate = await deps.rateLimiter.consume(
          `login-google:${ipAddress ?? "unknown"}`,
          deps.env.RATE_LIMIT_LOGIN_PER_MIN,
          60,
        );
        if (!rate.allowed) {
          throw new ApiError(429, "rate_limited", "Too many login attempts");
        }
        const riskLevel = await getLoginRiskLevel({
          endpoint: "google_login",
          ipAddress,
          userAgent,
        });
        if (riskLevel === "high") {
          recordBotBlock("google_login");
          await recordBotEvent("bot.risk.blocked", {
            endpoint: "google_login",
            ipAddress,
          });
          throw new ApiError(
            403,
            "bot_risk_blocked",
            "Request blocked by bot risk policy",
          );
        }

        const loginMode = deps.env.TURNSTILE_ENFORCE_LOGIN_MODE ?? "risk";
        const requireChallenge =
          loginMode === "always" ||
          (loginMode === "risk" && riskLevel === "medium");
        if (requireChallenge) {
          await verifyChallengeOrThrow({
            endpoint: "google_login",
            action: "google_login",
            ipAddress,
            token: payload.challengeToken,
            failOpenOnProviderError: true,
          });
        }

        const result = await deps.authService.loginWithGoogle({
          idToken: payload.idToken,
          ipAddress,
          userAgent,
          mfaCode: payload.mfaCode,
          mfaFactorId: payload.mfaFactorId,
          mfaRecoveryCode: payload.mfaRecoveryCode,
        });
        if (!result.ok) throw result.error;
        if ("accessToken" in result.value) {
          setAuthCookies(c, result.value.accessToken);
        }
        return result.value;
      },
    }),
  );

  app.post(
    "/oauth/token",
    publicEndpointAdapter({
      schema: refreshRequestSchema,
      handler: async (c, payload) => {
        const ipAddress = getIpAddress(c.req.header("x-forwarded-for"));
        const rate = await deps.rateLimiter.consume(
          `oauth-token:${ipAddress ?? "unknown"}`,
          deps.env.RATE_LIMIT_OAUTH_PER_MIN,
          60,
        );
        if (!rate.allowed) {
          throw new ApiError(
            429,
            "rate_limited",
            "Too many OAuth token requests",
          );
        }
        await deps.oauthClientService.authenticateClientBasic(
          c.req.header("authorization"),
        );
        const result = await deps.authService.refresh(payload.refreshToken);
        if (!result.ok) throw result.error;
        return toOAuthTokenResponse(result.value);
      },
    }),
  );

  app.post(
    "/v1/token/refresh",
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
    "/oauth/introspection",
    publicEndpointAdapter({
      schema: oauthIntrospectionRequestSchema,
      handler: async (c, payload) => {
        const ipAddress = getIpAddress(c.req.header("x-forwarded-for"));
        const rate = await deps.rateLimiter.consume(
          `oauth-introspection:${ipAddress ?? "unknown"}`,
          deps.env.RATE_LIMIT_OAUTH_PER_MIN,
          60,
        );
        if (!rate.allowed) {
          throw new ApiError(
            429,
            "rate_limited",
            "Too many OAuth introspection requests",
          );
        }
        await deps.oauthClientService.authenticateClientBasic(
          c.req.header("authorization"),
        );
        const result = await deps.authService.introspectToken(payload.token);
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

  app.post(
    "/v1/email/verify/confirm",
    publicEndpointAdapter({
      schema: emailVerificationConfirmSchema,
      handler: async (_c, payload) => {
        const result = await deps.authService.confirmEmailVerification(
          payload.token,
        );
        if (!result.ok) throw result.error;
        return result.value;
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
        const requireChallenge = requiredChallengeActions.has("password_reset");
        if (requireChallenge) {
          await verifyChallengeOrThrow({
            endpoint: "password_reset",
            action: "password_reset",
            ipAddress,
            token: payload.challengeToken,
            failOpenOnProviderError: false,
          });
        }
        const result = await deps.authService.requestPasswordReset(
          payload.email,
        );
        if (!result.ok) throw result.error;
        return deps.env.NODE_ENV === "production"
          ? { status: "accepted" as const, accepted: true as const }
          : result.value;
      },
    }),
  );

  app.post(
    "/v1/password/reset/confirm",
    publicEndpointAdapter({
      schema: passwordResetConfirmRequestSchema,
      handler: async (_c, payload) => {
        const result = await deps.authService.confirmPasswordReset(
          payload.resetToken,
          payload.newPassword,
        );
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  return app;
};
