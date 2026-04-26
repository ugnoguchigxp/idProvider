import type { ConfigService } from "@idp/auth-core";
import {
  emailTemplateUpdateSchema,
  emptyRequestSchema,
  notificationUpdateSchema,
  socialLoginUpdateSchema,
} from "@idp/shared";
import { Hono } from "hono";
import { authenticatedEndpointAdapter } from "../../adapters/authenticated-endpoint-adapter.js";
import type { AppEnv } from "../../config/env.js";
import type { AuditRepository } from "../audit/audit.repository.js";
import type { AuthService } from "../auth/auth.service.js";
import { assertAdminPermission } from "../rbac/admin-authorization.js";
import type { RBACService } from "../rbac/rbac.service.js";

export type AdminRoutesDependencies = {
  authService: AuthService;
  rbacService: RBACService;
  configService: ConfigService;
  auditRepository: AuditRepository;
  env: AppEnv;
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
      handler: async (c, _payload, auth) => {
        await assertAdminPermission(deps, {
          userId: auth.userId,
          resource: "admin.config",
          action: "read",
          path: c.req.path,
          method: c.req.method,
        });
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
      handler: async (c, payload, auth) => {
        await assertAdminPermission(deps, {
          userId: auth.userId,
          resource: "admin.config",
          action: "write",
          path: c.req.path,
          method: c.req.method,
        });
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
      handler: async (c, payload, auth) => {
        await assertAdminPermission(deps, {
          userId: auth.userId,
          resource: "admin.config",
          action: "write",
          path: c.req.path,
          method: c.req.method,
        });
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
      handler: async (c, payload, auth) => {
        await assertAdminPermission(deps, {
          userId: auth.userId,
          resource: "admin.config",
          action: "write",
          path: c.req.path,
          method: c.req.method,
        });
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
