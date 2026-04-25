import type { WebAuthnService } from "@idp/auth-core";
import {
  ApiError,
  emptyRequestSchema,
  mfaEnrollRequestSchema,
  mfaVerifyRequestSchema,
  webauthnRegistrationVerifySchema,
} from "@idp/shared";
import { Hono } from "hono";
import { authenticatedEndpointAdapter } from "../../adapters/authenticated-endpoint-adapter.js";
import type { AuthService } from "../auth/auth.service.js";
import type { UserService } from "../users/users.service.js";
import type { MfaService } from "./mfa.service.js";

export type MfaRoutesDependencies = {
  mfaService: MfaService;
  userService: UserService;
  authService: AuthService;
  webauthnService: WebAuthnService;
};

export const createMfaRoutes = (deps: MfaRoutesDependencies) => {
  const app = new Hono();

  const authenticate = deps.authService.authenticateAccessToken.bind(
    deps.authService,
  );

  app.post(
    "/v1/mfa/enroll",
    authenticatedEndpointAdapter({
      schema: mfaEnrollRequestSchema,
      authenticate,
      handler: async (_c, _payload, auth) => {
        const result = await deps.mfaService.enrollMfa(auth.userId);
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  app.post(
    "/v1/mfa/verify",
    authenticatedEndpointAdapter({
      schema: mfaVerifyRequestSchema,
      authenticate,
      handler: async (_c, payload, auth) => {
        const result = await deps.mfaService.verifyMfa(
          auth.userId,
          payload.factorId,
          payload.code,
        );
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  app.get(
    "/v1/mfa/webauthn/register/options",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate,
      handler: async (_c, _payload, auth) => {
        const userRes = await deps.userService.getMe(auth.userId);
        if (!userRes.ok) throw userRes.error;
        const email = userRes.value.email;
        if (!email)
          throw new ApiError(400, "email_not_found", "User email not found");
        return deps.webauthnService.generateRegistrationOptions(
          auth.userId,
          email,
        );
      },
    }),
  );

  app.post(
    "/v1/mfa/webauthn/register/verify",
    authenticatedEndpointAdapter({
      schema: webauthnRegistrationVerifySchema,
      authenticate,
      handler: async (_c, payload, auth) => {
        return deps.webauthnService.verifyRegistrationResponse(
          auth.userId,
          payload.response,
          payload.name,
        );
      },
    }),
  );

  return app;
};
