import {
  ApiError,
  emailTemplateUpdateSchema,
  emptyRequestSchema,
  notificationUpdateSchema,
  socialLoginUpdateSchema,
} from "@idp/shared";
import { Hono } from "hono";
import { authenticatedEndpointAdapter } from "../adapters/authenticated-endpoint-adapter.js";
import type { AppDependencies } from "../core/app-context.js";

const assertAdmin = async (deps: AppDependencies, userId: string) => {
  const auth = await deps.authService.authorizationCheck({
    userId,
    resource: "admin",
    action: "manage",
  });
  if (!auth.allowed) {
    throw new ApiError(403, "forbidden", "Admin privilege is required");
  }
};

const readBearerToken = (authorization: string | undefined): string => {
  if (!authorization?.startsWith("Bearer ")) {
    throw new ApiError(401, "unauthorized", "Missing bearer token");
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (token.length < 16) {
    throw new ApiError(401, "unauthorized", "Invalid bearer token");
  }
  return token;
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const buildAdminRoutes = (deps: AppDependencies) => {
  const app = new Hono();

  app.get("/admin", async (c) => {
    const accessToken = readBearerToken(c.req.header("authorization"));
    const auth = await deps.authService.authenticateAccessToken(accessToken);
    await assertAdmin(deps, auth.userId);
    const social = await deps.configService.getSocialLoginConfig("google");
    const notifications = await deps.configService.getNotificationConfig();
    const signupTemplate =
      await deps.configService.getEmailTemplateConfig("signup_verify");
    const resetTemplate =
      await deps.configService.getEmailTemplateConfig("password_reset");
    const socialClientId = escapeHtml(social.clientId);
    const socialClientSecret = escapeHtml(social.clientSecret);
    const notificationRecipients = escapeHtml(
      notifications.notificationRecipients.join(","),
    );
    const alertLevels = escapeHtml(notifications.alertLevels.join(","));
    const signupSubject = escapeHtml(signupTemplate.subject);
    const signupBody = escapeHtml(signupTemplate.body);
    const resetSubject = escapeHtml(resetTemplate.subject);
    const resetBody = escapeHtml(resetTemplate.body);

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Admin Settings</title>
    <script src="https://unpkg.com/htmx.org@1.9.12"></script>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; background: #f5f7fa; color: #16202a; }
      .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
      .card { background: #fff; border: 1px solid #d9e1ea; border-radius: 10px; padding: 16px; }
      input, textarea { width: 100%; margin-top: 8px; margin-bottom: 12px; padding: 8px; border: 1px solid #c9d2dc; border-radius: 6px; }
      button { background: #0d4f8b; color: white; border: none; border-radius: 6px; padding: 8px 12px; cursor: pointer; }
      .hint { font-size: 12px; color: #506173; }
    </style>
  </head>
  <body>
    <h1>Admin Settings</h1>
    <p class="hint">Use Bearer token authentication in this session. Actions update server-side configs immediately.</p>
    <div class="card">
      <label>Admin access token for HTMX requests
        <input id="admin-token" placeholder="paste bearer token without prefix" />
      </label>
      <button type="button" onclick="window.localStorage.setItem('admin_access_token', document.getElementById('admin-token').value)">Set Token</button>
    </div>
    <div class="grid">
      <section class="card">
        <h2>Google Social Login</h2>
        <form hx-put="/v1/admin/configs/social-login/google" hx-target="#social-result" hx-swap="innerHTML">
          <input type="hidden" name="providerEnabled" value="false" />
          <label>Enabled
            <input type="checkbox" name="providerEnabled" ${social.providerEnabled ? "checked" : ""} />
          </label>
          <label>Client ID<input name="clientId" value="${socialClientId}" /></label>
          <label>Client Secret<input name="clientSecret" value="${socialClientSecret}" /></label>
          <button type="submit">Save</button>
        </form>
        <div id="social-result"></div>
      </section>

      <section class="card">
        <h2>Notifications</h2>
        <form hx-put="/v1/admin/configs/notifications" hx-target="#notify-result" hx-swap="innerHTML">
          <label>Recipients (comma separated emails)
            <input name="notificationRecipients" value="${notificationRecipients}" />
          </label>
          <label>Alert Levels (comma separated: Critical,Warning)
            <input name="alertLevels" value="${alertLevels}" />
          </label>
          <button type="submit">Save</button>
        </form>
        <div id="notify-result"></div>
      </section>

      <section class="card">
        <h2>Email Template: signup_verify</h2>
        <form hx-put="/v1/admin/configs/email-template" hx-target="#signup-template-result" hx-swap="innerHTML">
          <input type="hidden" name="templateKey" value="signup_verify" />
          <label>Subject<input name="subject" value="${signupSubject}" /></label>
          <label>Body<textarea name="body" rows="6">${signupBody}</textarea></label>
          <button type="submit">Save</button>
        </form>
        <div id="signup-template-result"></div>
      </section>

      <section class="card">
        <h2>Email Template: password_reset</h2>
        <form hx-put="/v1/admin/configs/email-template" hx-target="#reset-template-result" hx-swap="innerHTML">
          <input type="hidden" name="templateKey" value="password_reset" />
          <label>Subject<input name="subject" value="${resetSubject}" /></label>
          <label>Body<textarea name="body" rows="6">${resetBody}</textarea></label>
          <button type="submit">Save</button>
        </form>
        <div id="reset-template-result"></div>
      </section>
    </div>
    <script>
      document.body.addEventListener("htmx:configRequest", function(event) {
        const token = window.localStorage.getItem("admin_access_token");
        if (token) {
          event.detail.headers["Authorization"] = "Bearer " + token;
          event.detail.headers["Content-Type"] = "application/x-www-form-urlencoded";
        }
      });
    </script>
  </body>
</html>`;
    return c.html(html);
  });

  app.get(
    "/v1/admin/configs",
    authenticatedEndpointAdapter({
      schema: emptyRequestSchema,
      authenticate: deps.authService.authenticateAccessToken.bind(
        deps.authService,
      ),
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
      authenticate: deps.authService.authenticateAccessToken.bind(
        deps.authService,
      ),
      handler: async (_c, payload, auth) => {
        await assertAdmin(deps, auth.userId);
        await deps.configService.updateSocialLoginConfig("google", payload);
        return { status: "ok" };
      },
    }),
  );

  app.put(
    "/v1/admin/configs/notifications",
    authenticatedEndpointAdapter({
      schema: notificationUpdateSchema.transform((value) => ({
        notificationRecipients: value.notificationRecipients,
        alertLevels: value.alertLevels,
      })),
      authenticate: deps.authService.authenticateAccessToken.bind(
        deps.authService,
      ),
      handler: async (_c, payload, auth) => {
        await assertAdmin(deps, auth.userId);
        await deps.configService.updateNotificationConfig(payload);
        return { status: "ok" };
      },
    }),
  );

  app.put(
    "/v1/admin/configs/email-template",
    authenticatedEndpointAdapter({
      schema: emailTemplateUpdateSchema,
      authenticate: deps.authService.authenticateAccessToken.bind(
        deps.authService,
      ),
      handler: async (_c, payload, auth) => {
        await assertAdmin(deps, auth.userId);
        await deps.configService.updateEmailTemplateConfig(
          payload.templateKey,
          {
            subject: payload.subject,
            body: payload.body,
          },
        );
        return { status: "ok" };
      },
    }),
  );

  return app;
};
