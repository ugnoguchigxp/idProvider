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
    <title>GXP Admin Console</title>
    <script src="https://unpkg.com/htmx.org@1.9.12"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      :root {
        --primary: #4f46e5;
        --primary-hover: #4338ca;
        --bg: #f8fafc;
        --card-bg: #ffffff;
        --text-main: #1e293b;
        --text-muted: #64748b;
        --border: #e2e8f0;
        --success: #10b981;
      }
      body {
        font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
        margin: 0;
        background: var(--bg);
        color: var(--text-main);
        line-height: 1.5;
      }
      .app-container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 40px 20px;
      }
      header {
        margin-bottom: 40px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      h1 { font-size: 24px; font-weight: 700; margin: 0; color: #0f172a; }
      .hint { font-size: 14px; color: var(--text-muted); }
      
      .grid {
        display: grid;
        gap: 24px;
        grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
      }
      
      .card {
        background: var(--card-bg);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 24px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .card:hover {
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      }
      
      h2 { font-size: 18px; font-weight: 600; margin-top: 0; margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
      
      .form-group { margin-bottom: 16px; }
      label { display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 6px; }
      
      input[type="text"], input[type="password"], textarea {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--border);
        border-radius: 8px;
        font-family: inherit;
        font-size: 14px;
        transition: border-color 0.2s, box-shadow 0.2s;
        box-sizing: border-box;
      }
      input:focus, textarea:focus {
        outline: none;
        border-color: var(--primary);
        box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
      }
      
      .checkbox-group {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 20px;
        background: #f1f5f9;
        padding: 12px;
        border-radius: 8px;
      }
      input[type="checkbox"] {
        width: 18px;
        height: 18px;
        cursor: pointer;
      }
      
      button {
        background: var(--primary);
        color: white;
        border: none;
        border-radius: 8px;
        padding: 10px 16px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
        width: 100%;
      }
      button:hover { background: var(--primary-hover); }
      button:active { transform: translateY(1px); }
      
      .token-section {
        background: #1e293b;
        color: white;
        padding: 24px;
        border-radius: 12px;
        margin-bottom: 32px;
      }
      .token-section label { color: #94a3b8; }
      .token-section input {
        background: #334155;
        border-color: #475569;
        color: white;
      }
      .token-section button {
        background: #6366f1;
        width: auto;
      }
      
      .status-indicator {
        margin-top: 12px;
        font-size: 13px;
        min-height: 20px;
        text-align: center;
      }
      .htmx-requesting button { opacity: 0.7; pointer-events: none; }
      .success-msg { color: var(--success); font-weight: 500; }
      .error-msg { color: #ef4444; font-weight: 500; }
    </style>
  </head>
  <body>
    <div class="app-container">
      <header>
        <div>
          <h1>GXP Admin Console</h1>
          <p class="hint">Configure Identity Provider settings dynamically.</p>
        </div>
      </header>

      <section class="token-section">
        <label for="admin-token">Admin Access Token</label>
        <div style="display: flex; gap: 12px; margin-top: 8px;">
          <input id="admin-token" type="password" placeholder="Paste your bearer token here" style="margin: 0; flex: 1;" />
          <button type="button" onclick="const v = document.getElementById('admin-token').value; window.localStorage.setItem('admin_access_token', v); alert('Token saved to local storage')">Set Token</button>
        </div>
      </section>

      <div class="grid">
        <!-- Google Social Login -->
        <section class="card">
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            Google Federation
          </h2>
          <form hx-put="/v1/admin/configs/social-login/google" hx-target="#social-result" hx-swap="innerHTML">
            <div class="checkbox-group">
              <input type="checkbox" name="providerEnabled" id="google-enabled" ${social.providerEnabled ? "checked" : ""} />
              <label for="google-enabled" style="margin: 0;">Enable Google Login & Linking</label>
              <input type="hidden" name="providerEnabled" value="false" hx-disable />
            </div>
            
            <div class="form-group">
              <label>Client ID</label>
              <input name="clientId" value="${socialClientId}" placeholder="Enter Google Client ID" />
            </div>
            
            <div class="form-group">
              <label>Client Secret</label>
              <input name="clientSecret" type="password" value="${socialClientSecret}" placeholder="••••••••••••••••" />
            </div>
            
            <button type="submit">Update Google Settings</button>
          </form>
          <div id="social-result" class="status-indicator"></div>
        </section>

        <!-- Notifications -->
        <section class="card">
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/></svg>
            Security Notifications
          </h2>
          <form hx-put="/v1/admin/configs/notifications" hx-target="#notify-result" hx-swap="innerHTML">
            <div class="form-group">
              <label>Recipients</label>
              <input name="notificationRecipients" value="${notificationRecipients}" placeholder="admin@example.com, security@example.com" />
            </div>
            
            <div class="form-group">
              <label>Alert Levels</label>
              <input name="alertLevels" value="${alertLevels}" placeholder="Critical, Warning" />
            </div>
            
            <button type="submit">Update Notifications</button>
          </form>
          <div id="notify-result" class="status-indicator"></div>
        </section>

        <!-- Email Template: Signup -->
        <section class="card">
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
            Template: Signup Verify
          </h2>
          <form hx-put="/v1/admin/configs/email-template" hx-target="#signup-template-result" hx-swap="innerHTML">
            <input type="hidden" name="templateKey" value="signup_verify" />
            <div class="form-group">
              <label>Subject</label>
              <input name="subject" value="${signupSubject}" />
            </div>
            <div class="form-group">
              <label>Body Content</label>
              <textarea name="body" rows="6">${signupBody}</textarea>
            </div>
            <button type="submit">Save Template</button>
          </form>
          <div id="signup-template-result" class="status-indicator"></div>
        </section>

        <!-- Email Template: Reset -->
        <section class="card">
          <h2>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3m-3-3l-2.25-2.25"/></svg>
            Template: Password Reset
          </h2>
          <form hx-put="/v1/admin/configs/email-template" hx-target="#reset-template-result" hx-swap="innerHTML">
            <input type="hidden" name="templateKey" value="password_reset" />
            <div class="form-group">
              <label>Subject</label>
              <input name="subject" value="${resetSubject}" />
            </div>
            <div class="form-group">
              <label>Body Content</label>
              <textarea name="body" rows="6">${resetBody}</textarea>
            </div>
            <button type="submit">Save Template</button>
          </form>
          <div id="reset-template-result" class="status-indicator"></div>
        </section>
      </div>
    </div>

    <script>
      document.body.addEventListener("htmx:configRequest", function(event) {
        const token = window.localStorage.getItem("admin_access_token");
        if (token) {
          event.detail.headers["Authorization"] = "Bearer " + token;
          event.detail.headers["Content-Type"] = "application/x-www-form-urlencoded";
        }
      });
      
      document.body.addEventListener("htmx:afterRequest", function(event) {
        if (event.detail.successful) {
          event.detail.target.innerHTML = '<span class="success-msg">Changes saved successfully</span>';
          setTimeout(() => {
            event.detail.target.innerHTML = '';
          }, 3000);
        } else {
          event.detail.target.innerHTML = '<span class="error-msg">Update failed</span>';
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
