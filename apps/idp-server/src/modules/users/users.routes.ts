import {
  emptyRequestSchema,
  googleLinkRequestSchema,
  googleUnlinkRequestSchema,
  passwordChangeRequestSchema,
} from "@idp/shared";
import { Hono } from "hono";
import { authenticatedEndpointAdapter } from "../../adapters/authenticated-endpoint-adapter.js";
import type { AuthService } from "../auth/auth.service.js";
import type { UserService } from "./users.service.js";

export type UserRoutesDependencies = {
  userService: UserService;
  authService: AuthService;
};

export const createUserRoutes = (deps: UserRoutesDependencies) => {
  const app = new Hono();

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
        const result = await deps.userService.linkGoogleIdentity({
          userId: auth.userId,
          idToken: payload.idToken,
          clientId: "",
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

  return app;
};
