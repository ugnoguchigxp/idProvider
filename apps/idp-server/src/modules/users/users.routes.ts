import type { ConfigService } from "@idp/auth-core";
import {
  ApiError,
  accountDeletionRequestSchema,
  emptyRequestSchema,
  googleLinkRequestSchema,
  googleUnlinkRequestSchema,
  passwordChangeRequestSchema,
  updateUserProfileRequestSchema,
} from "@idp/shared";
import { Hono } from "hono";
import { authenticatedEndpointAdapter } from "../../adapters/authenticated-endpoint-adapter.js";
import type { AppEnv } from "../../config/env.js";
import type { RateLimiter } from "../../core/rate-limiter.js";
import { clearCookie } from "../../utils/cookie.js";
import type { AuthService } from "../auth/auth.service.js";
import type { AccountDeletionService } from "./account-deletion.service.js";
import type { UserService } from "./users.service.js";

export type UserRoutesDependencies = {
  userService: UserService;
  authService: AuthService;
  accountDeletionService: AccountDeletionService;
  configService: ConfigService;
  rateLimiter: RateLimiter;
  env: AppEnv;
};

export const createUserRoutes = (deps: UserRoutesDependencies) => {
  const app = new Hono();
  const secureCookie = deps.env.NODE_ENV === "production";

  const authenticate = deps.authService.authenticateAccessToken.bind(
    deps.authService,
  );

  app.get(
    "/v1/me",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate,
      handler: async (_c, _payload, auth) => {
        const result = await deps.userService.getMe(auth.userId);
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  app.post(
    "/v1/password/change",
    authenticatedEndpointAdapter({
      schema: passwordChangeRequestSchema,
      authenticate,
      handler: async (_c, payload, auth) => {
        const result = await deps.userService.changePassword(
          auth.userId,
          payload.currentPassword,
          payload.newPassword,
        );
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  app.patch(
    "/v1/me",
    authenticatedEndpointAdapter({
      schema: updateUserProfileRequestSchema,
      authenticate,
      handler: async (_c, payload, auth) => {
        const rate = await deps.rateLimiter.consume(
          `profile-update:${auth.userId}`,
          deps.env.RATE_LIMIT_PROFILE_UPDATE_PER_10_MIN,
          10 * 60,
        );
        if (!rate.allowed) {
          throw new ApiError(
            429,
            "rate_limited",
            "Too many profile update attempts",
          );
        }

        const result = await deps.userService.updateProfile(
          auth.userId,
          payload,
        );
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  app.post(
    "/v1/identities/google/link",
    authenticatedEndpointAdapter({
      schema: googleLinkRequestSchema,
      authenticate,
      handler: async (_c, payload, auth) => {
        await deps.userService.verifyCurrentPassword(
          auth.userId,
          payload.currentPassword,
        );
        const social = await deps.configService.getSocialLoginConfig("google");
        const clientId = social.clientId || deps.env.GOOGLE_CLIENT_ID;
        const result = await deps.userService.linkGoogleIdentity({
          userId: auth.userId,
          idToken: payload.idToken,
          clientId,
        });
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  app.post(
    "/v1/identities/google/unlink",
    authenticatedEndpointAdapter({
      schema: googleUnlinkRequestSchema,
      authenticate,
      handler: async (_c, payload, auth) => {
        await deps.userService.verifyCurrentPassword(
          auth.userId,
          payload.currentPassword,
        );
        const result = await deps.userService.unlinkSocialIdentity(
          auth.userId,
          "google",
          payload.providerSubject,
        );
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  app.delete(
    "/v1/account",
    authenticatedEndpointAdapter({
      schema: accountDeletionRequestSchema,
      authenticate,
      handler: async (c, payload, auth) => {
        const rate = await deps.rateLimiter.consume(
          `account-delete:${auth.userId}`,
          deps.env.RATE_LIMIT_ACCOUNT_DELETE_PER_HOUR,
          60 * 60,
        );
        if (!rate.allowed) {
          throw new ApiError(
            429,
            "rate_limited",
            "Too many account deletion attempts",
          );
        }

        const result = await deps.accountDeletionService.requestDeletion(
          auth.userId,
          payload,
        );
        if (!result.ok) throw result.error;
        if (result.value.alreadyDeleted) {
          c.status(202);
        }
        c.header("Set-Cookie", clearCookie("idp_access_token", secureCookie), {
          append: true,
        });
        c.header("Set-Cookie", clearCookie("idp_csrf_token", secureCookie), {
          append: true,
        });
        return {
          status: result.value.status,
          deletionDueAt: result.value.deletionDueAt,
        };
      },
    }),
  );

  return app;
};
