import type Provider from "oidc-provider";
import type { AuthService } from "../modules/auth/auth.service.js";

type InteractionDeps = {
  authService: AuthService;
};

type KoaLikeContext = {
  path: string;
  method: string;
  req: Parameters<Provider["interactionDetails"]>[0] & NodeJS.ReadableStream;
  res: Parameters<Provider["interactionDetails"]>[1];
  status: number;
  type: string;
  body: string;
  throw: (status: number, message: string) => never;
};

type InteractionDetails = Awaited<ReturnType<Provider["interactionDetails"]>>;

const htmlEscape = (value: unknown): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const readForm = async (req: NodeJS.ReadableStream) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
};

const renderLogin = (input: {
  uid: string;
  clientName: string;
  loginHint?: string;
  error?: string;
  mfaRequired?: boolean;
}) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; background: #f6f7f9; color: #20242a; }
    main { max-width: 360px; margin: 12vh auto; padding: 28px; background: #fff; border: 1px solid #d9dde3; border-radius: 8px; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    p { color: #5d6673; margin: 0 0 20px; }
    label { display: block; font-size: 13px; margin: 14px 0 6px; }
    input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #b8c0cc; border-radius: 6px; font-size: 15px; }
    button { width: 100%; margin-top: 18px; padding: 11px 14px; border: 0; border-radius: 6px; background: #1f6feb; color: #fff; font-weight: 700; }
    .error { background: #fff1f1; color: #a4161a; border: 1px solid #ffc9c9; padding: 10px; border-radius: 6px; margin-bottom: 12px; }
  </style>
</head>
<body>
  <main>
    <h1>Sign in</h1>
    <p>${htmlEscape(input.clientName)} wants to authenticate your account.</p>
    ${input.error ? `<div class="error">${htmlEscape(input.error)}</div>` : ""}
    <form method="post" action="/interaction/${htmlEscape(input.uid)}">
      <input type="hidden" name="prompt" value="login" />
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" required value="${htmlEscape(input.loginHint)}" />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      ${
        input.mfaRequired
          ? `<label for="mfaCode">MFA code</label>
      <input id="mfaCode" name="mfaCode" autocomplete="one-time-code" />
      <label for="mfaRecoveryCode">Recovery code</label>
      <input id="mfaRecoveryCode" name="mfaRecoveryCode" />`
          : ""
      }
      <button type="submit">Continue</button>
    </form>
  </main>
</body>
</html>`;

const renderUnsupported = (message: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Unsupported interaction</title></head>
<body><main><h1>Unsupported interaction</h1><p>${htmlEscape(message)}</p></main></body></html>`;

const getClientName = async (provider: Provider, clientId: string) => {
  const client = await provider.Client.find(clientId);
  return (
    (client?.metadata().client_name as string | undefined) ??
    client?.clientId ??
    clientId
  );
};

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const finishConsent = async (
  provider: Provider,
  ctx: KoaLikeContext,
  details: InteractionDetails,
) => {
  const { prompt, grantId, session, params } = details;
  if (prompt.name !== "consent") {
    return false;
  }
  const clientId = stringValue(params.client_id);
  if (!clientId) {
    ctx.throw(400, "Missing client_id");
  }
  if (!session?.accountId) {
    ctx.throw(400, "Missing authenticated session");
  }

  const grant = grantId
    ? await provider.Grant.find(grantId)
    : new provider.Grant({
        accountId: session.accountId,
        clientId,
      });

  if (!grant) {
    ctx.throw(400, "Grant not found");
    return true;
  }

  const promptDetails = prompt.details as Record<string, unknown>;
  const missingOidcScope = promptDetails.missingOIDCScope;
  const missingOidcClaims = promptDetails.missingOIDCClaims;
  const missingResourceScopes = promptDetails.missingResourceScopes;

  if (Array.isArray(missingOidcScope)) {
    grant.addOIDCScope(missingOidcScope.join(" "));
  }
  if (Array.isArray(missingOidcClaims)) {
    grant.addOIDCClaims(missingOidcClaims);
  }
  if (missingResourceScopes && typeof missingResourceScopes === "object") {
    for (const [indicator, scopes] of Object.entries(missingResourceScopes)) {
      if (Array.isArray(scopes)) {
        grant.addResourceScope(indicator, scopes.join(" "));
      }
    }
  }

  await provider.interactionFinished(
    ctx.req,
    ctx.res,
    { consent: { grantId: await grant.save() } },
    { mergeWithLastSubmission: true },
  );
  return true;
};

export const attachOidcProductionInteractions = (
  provider: Provider,
  deps: InteractionDeps,
) => {
  provider.use(async (ctx: KoaLikeContext, next: () => Promise<void>) => {
    const match = ctx.path.match(/^\/interaction\/([^/]+)$/);
    if (!match) {
      return next();
    }

    const details = await provider.interactionDetails(ctx.req, ctx.res);
    if (await finishConsent(provider, ctx, details)) {
      return undefined;
    }

    const { uid, prompt, params } = details;
    const clientId = stringValue(params.client_id);
    if (!clientId) {
      ctx.throw(400, "Missing client_id");
    }
    const clientName = await getClientName(provider, clientId);

    if (prompt.name !== "login") {
      ctx.status = 501;
      ctx.type = "html";
      ctx.body = renderUnsupported(`Prompt ${prompt.name} is not implemented.`);
      return undefined;
    }

    if (ctx.method === "GET") {
      const loginHint = stringValue(params.login_hint);
      ctx.type = "html";
      ctx.body = renderLogin({
        uid,
        clientName,
        ...(loginHint ? { loginHint } : {}),
      });
      return undefined;
    }

    if (ctx.method !== "POST") {
      ctx.status = 405;
      return undefined;
    }

    const form = await readForm(ctx.req);
    const email = form.get("email") ?? "";
    const password = form.get("password") ?? "";
    const mfaCode = form.get("mfaCode") || undefined;
    const mfaRecoveryCode = form.get("mfaRecoveryCode") || undefined;

    try {
      const result = await deps.authService.login(email, password, null, null, {
        mfaCode,
        mfaRecoveryCode,
      });
      if (!result.ok) throw result.error;

      if ("mfaRequired" in result.value) {
        ctx.status = 401;
        ctx.type = "html";
        ctx.body = renderLogin({
          uid,
          clientName,
          loginHint: email,
          mfaRequired: true,
          error: "MFA is required.",
        });
        return undefined;
      }

      await provider.interactionFinished(
        ctx.req,
        ctx.res,
        {
          login: {
            accountId: result.value.userId,
            remember: true,
            amr: mfaCode || mfaRecoveryCode ? ["pwd", "otp"] : ["pwd"],
          },
        },
        { mergeWithLastSubmission: false },
      );
      return undefined;
    } catch (_error: unknown) {
      ctx.status = 401;
      ctx.type = "html";
      ctx.body = renderLogin({
        uid,
        clientName,
        loginHint: email,
        mfaRequired: Boolean(mfaCode || mfaRecoveryCode),
        error: "Invalid credentials.",
      });
      return undefined;
    }
  });
};
