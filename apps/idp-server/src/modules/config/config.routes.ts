import type { ConfigService } from "@idp/auth-core";
import {
  ApiError,
  emailTemplateUpdateSchema,
  emptyRequestSchema,
  notificationUpdateSchema,
  socialLoginUpdateSchema,
} from "@idp/shared";
import { Hono } from "hono";
import { authenticatedEndpointAdapter } from "../../adapters/authenticated-endpoint-adapter.js";
import type { AuditRepository } from "../audit/audit.repository.js";
import type { AuthService } from "../auth/auth.service.js";
import type { RBACService } from "../rbac/rbac.service.js";

export type AdminRoutesDependencies = {
  authService: AuthService;
  rbacService: RBACService;
  configService: ConfigService;
  auditRepository: AuditRepository;
};

const assertAdmin = async (deps: AdminRoutesDependencies, userId: string) => {
  const auth = await deps.rbacService.authorizationCheck({
    userId,
    resource: "admin",
    action: "manage",
  });
  if (!auth.allowed) {
    throw new ApiError(403, "forbidden", "Admin privilege is required");
  }
};

export const createConfigRoutes = (deps: AdminRoutesDependencies) => {
  const app = new Hono();

  const authenticate = deps.authService.authenticateAccessToken.bind(
    deps.authService,
  );

  app.get(
    "/v1/admin/configs",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate,
      handler: async (_c, _payload, auth) => {
        await assertAdmin(deps, auth.userId);
        const [social, notifications, signupTemplate, resetTemplate] =
          await Promise.all([
            deps.configService.getSocialLoginConfig("google"),
            deps.configService.getNotificationConfig(),
            deps.configService.getEmailTemplateConfig("signup_verify"),
            deps.configService.getEmailTemplateConfig("password_reset"),
          ]);
        return {
          socialLogin: { google: social },
          notifications,
          emailTemplates: {
            signup_verify: signupTemplate,
            password_reset: resetTemplate,
          },
        };
      },
    }),
  );

  app.put(
    "/v1/admin/configs/social-login/google",
    authenticatedEndpointAdapter({
      schema: socialLoginUpdateSchema,
      authenticate,
      handler: async (_c, payload, auth) => {
        await assertAdmin(deps, auth.userId);
        await deps.configService.updateSocialLoginConfig("google", payload);
        await deps.auditRepository.createSecurityEvent({
          eventType: "admin.config.updated",
          userId: auth.userId,
          payload: {
            key: "social_login.google",
          },
        });
        return { status: "ok" };
      },
    }),
  );

  app.put(
    "/v1/admin/configs/notifications",
    authenticatedEndpointAdapter({
      schema: notificationUpdateSchema,
      authenticate,
      handler: async (_c, payload, auth) => {
        await assertAdmin(deps, auth.userId);
        await deps.configService.updateNotificationConfig(payload);
        await deps.auditRepository.createSecurityEvent({
          eventType: "admin.config.updated",
          userId: auth.userId,
          payload: {
            key: "notifications",
          },
        });
        return { status: "ok" };
      },
    }),
  );

  app.put(
    "/v1/admin/configs/email-template",
    authenticatedEndpointAdapter({
      schema: emailTemplateUpdateSchema,
      authenticate,
      handler: async (_c, payload, auth) => {
        await assertAdmin(deps, auth.userId);
        await deps.configService.updateEmailTemplateConfig(
          payload.templateKey,
          {
            subject: payload.subject,
            body: payload.body,
          },
        );
        await deps.auditRepository.createSecurityEvent({
          eventType: "admin.config.updated",
          userId: auth.userId,
          payload: {
            key: `email_templates.${payload.templateKey}`,
          },
        });
        return { status: "ok" };
      },
    }),
  );

  return app;
};
