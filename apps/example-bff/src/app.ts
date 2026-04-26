import {
  type AuthorizationUrlResult,
  type CompleteAuthorizationCodeCallbackResult,
  createServerSdkClient,
  type ServerSdkClient,
} from "@idp/server-sdk";
import { Hono } from "hono";
import {
  type CookieSecurity,
  clearCookie,
  type LocalSession,
  oauthStateCookieName,
  type PendingOidcState,
  parseCookies,
  seal,
  serializeCookie,
  sessionCookieName,
  unseal,
} from "./session.js";

export type ExampleBffConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  sessionSecret: string;
  sessionTtlSeconds: number;
  cookieSecurity: CookieSecurity;
};

type ServerSdk = Pick<
  ServerSdkClient,
  | "createAuthorizationUrl"
  | "completeAuthorizationCodeCallback"
  | "createLogoutUrl"
>;

type CreateExampleBffAppOptions = {
  config: ExampleBffConfig;
  sdk?: ServerSdk;
};

const html = (body: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Example BFF</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 40px; line-height: 1.5; color: #17202a; }
    main { max-width: 760px; margin: 0 auto; }
    a, button { display: inline-block; margin: 8px 8px 8px 0; }
    button { padding: 8px 12px; }
    pre { background: #f4f6f8; padding: 16px; overflow: auto; }
  </style>
</head>
<body><main>${body}</main></body>
</html>`;

const callbackUrl = (config: ExampleBffConfig) =>
  new URL("/callback", config.baseUrl).toString();

const postLogoutRedirectUrl = (config: ExampleBffConfig) =>
  new URL("/", config.baseUrl).toString();

const appendSetCookie = (headers: Headers, value: string) => {
  headers.append("set-cookie", value);
};

const getSession = (
  cookieHeader: string | undefined,
  config: ExampleBffConfig,
): LocalSession | undefined => {
  const cookie = parseCookies(cookieHeader)[sessionCookieName];
  if (!cookie) {
    return undefined;
  }
  const session = unseal<LocalSession>(cookie, config.sessionSecret);
  if (session.expiresAt <= Date.now()) {
    return undefined;
  }
  return session;
};

const issueSessionCookie = (
  result: CompleteAuthorizationCodeCallbackResult,
  config: ExampleBffConfig,
): string => {
  const now = Date.now();
  const session: LocalSession = {
    identity: result.sessionIdentity,
    createdAt: now,
    expiresAt: now + config.sessionTtlSeconds * 1000,
  };
  return serializeCookie(
    sessionCookieName,
    seal(session, config.sessionSecret),
    {
      ...config.cookieSecurity,
      httpOnly: true,
      maxAge: config.sessionTtlSeconds,
    },
  );
};

export const createExampleBffApp = ({
  config,
  sdk = createServerSdkClient({
    issuer: config.issuer,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  }),
}: CreateExampleBffAppOptions) => {
  const app = new Hono();

  app.get("/", (c) => {
    const session = getSession(c.req.header("cookie"), config);
    if (!session) {
      return c.html(
        html(`<h1>Example BFF</h1>
<p>This app is not logged in locally.</p>
<p><a href="/login">Login with IdP</a></p>`),
      );
    }

    return c.html(
      html(`<h1>Example BFF</h1>
<p>Logged in as <strong>${session.identity.email ?? session.identity.userId}</strong>.</p>
<pre>${JSON.stringify(session.identity, null, 2)}</pre>
<p><a href="/protected">Protected page</a></p>
<form method="post" action="/logout"><button type="submit">Local logout</button></form>
<form method="post" action="/logout/global"><button type="submit">Global logout</button></form>`),
    );
  });

  app.get("/login", async (c) => {
    const auth: AuthorizationUrlResult = await sdk.createAuthorizationUrl({
      redirectUri: callbackUrl(config),
      scope: ["openid", "profile", "email"],
    });
    const pending: PendingOidcState = {
      state: auth.state,
      nonce: auth.nonce,
      codeVerifier: auth.codeVerifier,
      createdAt: Date.now(),
    };
    const response = c.redirect(auth.url, 302);
    appendSetCookie(
      response.headers,
      serializeCookie(
        oauthStateCookieName,
        seal(pending, config.sessionSecret),
        {
          ...config.cookieSecurity,
          httpOnly: true,
          maxAge: 300,
        },
      ),
    );
    return response;
  });

  app.get("/callback", async (c) => {
    const cookies = parseCookies(c.req.header("cookie"));
    let pending: PendingOidcState;
    try {
      pending = unseal<PendingOidcState>(
        cookies[oauthStateCookieName],
        config.sessionSecret,
      );
    } catch (_error) {
      return c.text("Invalid or expired OIDC state cookie", 400);
    }

    if (Date.now() - pending.createdAt > 5 * 60 * 1000) {
      return c.text("OIDC state cookie expired", 400);
    }

    const result = await sdk.completeAuthorizationCodeCallback({
      code: c.req.query("code") ?? null,
      state: c.req.query("state") ?? null,
      expectedState: pending.state,
      expectedNonce: pending.nonce,
      redirectUri: callbackUrl(config),
      codeVerifier: pending.codeVerifier,
      fetchUserInfo: true,
    });

    const response = c.redirect("/", 302);
    appendSetCookie(
      response.headers,
      clearCookie(oauthStateCookieName, config.cookieSecurity),
    );
    appendSetCookie(response.headers, issueSessionCookie(result, config));
    return response;
  });

  app.get("/me", (c) => {
    const session = getSession(c.req.header("cookie"), config);
    if (!session) {
      return c.json({ authenticated: false }, 401);
    }
    return c.json({
      authenticated: true,
      identity: session.identity,
      expiresAt: session.expiresAt,
    });
  });

  app.get("/protected", (c) => {
    const session = getSession(c.req.header("cookie"), config);
    if (!session) {
      return c.redirect("/login", 302);
    }
    return c.html(
      html(`<h1>Protected</h1>
<p>User ID: ${session.identity.userId}</p>
<p>Email: ${session.identity.email ?? "-"}</p>
<p><a href="/">Home</a></p>`),
    );
  });

  app.post("/logout", (c) => {
    const response = c.redirect("/", 302);
    appendSetCookie(
      response.headers,
      clearCookie(sessionCookieName, config.cookieSecurity),
    );
    return response;
  });

  app.post("/logout/global", async (c) => {
    const logoutUrl = await sdk.createLogoutUrl({
      postLogoutRedirectUri: postLogoutRedirectUrl(config),
    });
    const response = c.redirect(logoutUrl, 302);
    appendSetCookie(
      response.headers,
      clearCookie(sessionCookieName, config.cookieSecurity),
    );
    return response;
  });

  return app;
};

const requireString = (
  env: NodeJS.ProcessEnv,
  name: string,
  fallback?: string,
): string => {
  const value = env[name] ?? fallback;
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

export const loadExampleBffConfig = (
  env: NodeJS.ProcessEnv,
): ExampleBffConfig => {
  const baseUrl = requireString(env, "BFF_BASE_URL", "http://localhost:5173");
  const sessionSecret = requireString(
    env,
    "BFF_SESSION_SECRET",
    "dev-example-bff-session-secret-change-me",
  );
  return {
    issuer: requireString(env, "OIDC_ISSUER", "http://localhost:3001"),
    clientId: requireString(env, "OIDC_CLIENT_ID", "local-client"),
    clientSecret: requireString(
      env,
      "OIDC_CLIENT_SECRET",
      "local-client-secret",
    ),
    baseUrl,
    sessionSecret,
    sessionTtlSeconds: Number(env.BFF_SESSION_TTL_SECONDS ?? 3600),
    cookieSecurity: {
      secure: baseUrl.startsWith("https://"),
      sameSite: "Lax",
    },
  };
};
