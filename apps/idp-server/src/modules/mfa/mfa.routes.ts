import type { WebAuthnService } from "@idp/auth-core";
import {
  ApiError,
  emptyRequestSchema,
  mfaEnrollRequestSchema,
  mfaRecoveryRegenerateRequestSchema,
  mfaVerifyRequestSchema,
  webauthnAuthenticationOptionsSchema,
  webauthnAuthenticationVerifySchema,
  webauthnRegistrationVerifySchema,
} from "@idp/shared";
import { Hono } from "hono";
import { authenticatedEndpointAdapter } from "../../adapters/authenticated-endpoint-adapter.js";
import { publicEndpointAdapter } from "../../adapters/public-endpoint-adapter.js";
import { getIpAddress } from "../../utils/ip-address.js";
import type { AuthService } from "../auth/auth.service.js";
import type { UserService } from "../users/users.service.js";
import type { MfaService } from "./mfa.service.js";
import type { MfaRecoveryService } from "./mfa-recovery.service.js";

export type MfaRoutesDependencies = {
  mfaService: MfaService;
  mfaRecoveryService: MfaRecoveryService;
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
    "/v1/mfa/webauthn/authenticate/options",
    publicEndpointAdapter({
      schema: webauthnAuthenticationOptionsSchema,
      handler: async (_c, payload) => {
        const userId = await deps.userService.findActiveUserIdByEmail(
          payload.email,
        );
        if (!userId) {
          throw new ApiError(
            401,
            "invalid_credentials",
            "Invalid authentication request",
          );
        }
        return deps.webauthnService.generateAuthenticationOptions(userId);
      },
    }),
  );

  app.post(
    "/v1/mfa/webauthn/authenticate/verify",
    publicEndpointAdapter({
      schema: webauthnAuthenticationVerifySchema,
      handler: async (c, payload) => {
        const userId = await deps.userService.findActiveUserIdByEmail(
          payload.email,
        );
        if (!userId) {
          throw new ApiError(
            401,
            "invalid_credentials",
            "Invalid authentication request",
          );
        }

        await deps.webauthnService.verifyAuthenticationResponse(
          userId,
          payload.response,
        );
        const result = await deps.authService.createSessionForUser(
          userId,
          getIpAddress(c.req.header("x-forwarded-for")),
          c.req.header("user-agent") || null,
        );
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
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
        const result = await deps.webauthnService.verifyRegistrationResponse(
          auth.userId,
          payload.response,
          payload.name,
        );
        const generated = await deps.mfaRecoveryService.generateCodesIfMissing(
          auth.userId,
          "initial_mfa_setup",
        );
        if (generated.ok && generated.value.recoveryCodes.length > 0) {
          return {
            ...result,
            recoveryCodes: generated.value.recoveryCodes,
          };
        }
        return result;
      },
    }),
  );

  app.post(
    "/v1/mfa/recovery-codes/regenerate",
    authenticatedEndpointAdapter({
      schema: mfaRecoveryRegenerateRequestSchema,
      authenticate,
      handler: async (_c, payload, auth) => {
        const hasPassword = Boolean(payload.currentPassword);
        const hasMfa = Boolean(payload.mfaCode && payload.mfaFactorId);
        if (!hasPassword && !hasMfa) {
          throw new ApiError(
            400,
            "reauth_required",
            "Password or MFA reauthentication is required",
          );
        }
        if (hasPassword) {
          await deps.userService.verifyCurrentPassword(
            auth.userId,
            payload.currentPassword as string,
          );
        }
        if (hasMfa) {
          await deps.mfaService.verifyMfa(
            auth.userId,
            payload.mfaFactorId as string,
            payload.mfaCode as string,
            { issueRecoveryCodes: false },
          );
        }
        const result = await deps.mfaRecoveryService.regenerateCodes(
          auth.userId,
        );
        if (!result.ok) throw result.error;
        return result.value;
      },
    }),
  );

  return app;
};
