import {
  createHash,
  createPublicKey,
  type JsonWebKey,
  randomBytes,
  verify,
} from "node:crypto";

export type ServerSdkOptions = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
};

export type AuthorizationUrlResult = {
  url: string;
  state: string;
  nonce: string;
  codeVerifier: string;
};

export type TokenSet = {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
};

export type RefreshTokenSet = {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn: number;
};

export type VerifiedIdToken = {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  claims: Record<string, unknown>;
};

export type SessionIdentity = {
  userId: string;
  email?: string;
  emailVerified?: boolean;
  permissions: string[];
  entitlements: Record<string, unknown>;
  claims: Record<string, unknown>;
};

export type CompleteAuthorizationCodeCallbackResult = {
  tokens: TokenSet;
  idToken: VerifiedIdToken;
  userInfo?: Record<string, unknown>;
  sessionIdentity: SessionIdentity;
};

export type TokenIntrospectionResult = {
  active: boolean;
  scope?: string;
  clientId?: string;
  sub?: string;
  exp?: number;
  iat?: number;
  claims: Record<string, unknown>;
};

export type LogoutMode = "local" | "global";

export type LogoutInput = {
  mode: LogoutMode;
  refreshToken?: string;
  accessToken?: string;
  idTokenHint?: string;
  postLogoutRedirectUri?: string;
  state?: string;
  clearLocalSession: () => void | Promise<void>;
};

export type LogoutResult = {
  localSessionCleared: boolean;
  refreshTokenRevoked: boolean;
  accessTokenRevoked: boolean;
  logoutUrl?: string;
  warnings: string[];
};

type DiscoveryDocument = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
  end_session_endpoint?: string;
  introspection_endpoint?: string;
  revocation_endpoint?: string;
};

type Jwks = {
  keys: Array<JsonWebKey & { kid?: string }>;
};

export type JwtVerifierOptions = {
  issuer: string;
  audience: string;
  jwksUri?: string;
  timeoutMs?: number;
  clockSkewSeconds?: number;
  fetch?: typeof fetch;
};

export type VerifyAccessTokenInput = {
  requiredScopes?: string[];
};

export type VerifiedServiceAccessToken = {
  claims: Record<string, unknown>;
  scope: string[];
  sub?: string;
  clientId?: string;
};

export type ServiceAuthMiddlewareOptions = JwtVerifierOptions & {
  requiredScopes?: string[];
};

export class ServerSdkError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ServerSdkError";
  }
}

const base64Url = (input: Buffer | string): string =>
  Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const base64UrlToBuffer = (value: string): Buffer => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  return Buffer.from(padded, "base64");
};

const sha256Base64Url = (value: string): string =>
  base64Url(createHash("sha256").update(value).digest());

const randomToken = (): string => base64Url(randomBytes(32));

const decodeJson = (value: string): Record<string, unknown> => {
  try {
    return JSON.parse(base64UrlToBuffer(value).toString("utf8"));
  } catch (_error) {
    throw new ServerSdkError("oidc_invalid_token", "Invalid token JSON");
  }
};

const toBasic = (clientId: string, clientSecret: string): string =>
  `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;

const stringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
};

const recordValue = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const withTimeout = async <T>(
  timeoutMs: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ServerSdkError("oidc_timeout", "OIDC request timed out", true);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

export class ServerSdkClient {
  private discoveryCache?: DiscoveryDocument;
  private jwksCache?: Jwks;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: ServerSdkOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 3000;
  }

  async createAuthorizationUrl(input: {
    redirectUri: string;
    scope?: string[];
    state?: string;
    nonce?: string;
  }): Promise<AuthorizationUrlResult> {
    const discovery = await this.getDiscovery();
    const state = input.state ?? randomToken();
    const nonce = input.nonce ?? randomToken();
    const codeVerifier = randomToken();

    const url = new URL(discovery.authorization_endpoint);
    url.searchParams.set("client_id", this.options.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set(
      "scope",
      (input.scope ?? ["openid", "profile", "email"]).join(" "),
    );
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", sha256Base64Url(codeVerifier));
    url.searchParams.set("code_challenge_method", "S256");

    return { url: url.toString(), state, nonce, codeVerifier };
  }

  async exchangeCode(input: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<TokenSet> {
    const discovery = await this.getDiscovery();
    const response = await this.postForm(discovery.token_endpoint, {
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    });
    if (
      typeof response.id_token !== "string" ||
      !hasValidAccessTokenResponse(response)
    ) {
      throw new ServerSdkError(
        "oidc_invalid_response",
        "OIDC token response is missing required fields",
      );
    }

    const tokenSet: TokenSet = {
      idToken: response.id_token,
      accessToken: response.access_token,
      expiresIn: response.expires_in,
    };
    if (typeof response.refresh_token === "string") {
      tokenSet.refreshToken = response.refresh_token;
    }
    return tokenSet;
  }

  async refreshTokens(input: {
    refreshToken: string;
    scope?: string[];
  }): Promise<RefreshTokenSet> {
    const discovery = await this.getDiscovery();
    const body: Record<string, string> = {
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    };
    if (input.scope) {
      body.scope = input.scope.join(" ");
    }
    const response = await this.postForm(discovery.token_endpoint, body);
    if (!hasValidAccessTokenResponse(response)) {
      throw new ServerSdkError(
        "oidc_invalid_response",
        "OIDC refresh response is missing required fields",
      );
    }

    const tokenSet: RefreshTokenSet = {
      accessToken: response.access_token,
      expiresIn: response.expires_in,
    };
    if (typeof response.id_token === "string") {
      tokenSet.idToken = response.id_token;
    }
    if (typeof response.refresh_token === "string") {
      tokenSet.refreshToken = response.refresh_token;
    }
    return tokenSet;
  }

  async completeAuthorizationCodeCallback(input: {
    code?: string | null;
    state?: string | null;
    expectedState: string;
    expectedNonce?: string;
    redirectUri: string;
    codeVerifier: string;
    fetchUserInfo?: boolean;
  }): Promise<CompleteAuthorizationCodeCallbackResult> {
    if (!input.code) {
      throw new ServerSdkError(
        "oidc_invalid_callback",
        "Authorization callback is missing code",
      );
    }
    if (!input.state || input.state !== input.expectedState) {
      throw new ServerSdkError(
        "oidc_invalid_callback",
        "Authorization callback state mismatch",
      );
    }

    const tokens = await this.exchangeCode({
      code: input.code,
      redirectUri: input.redirectUri,
      codeVerifier: input.codeVerifier,
    });
    const idToken = await this.verifyIdToken({
      idToken: tokens.idToken,
      ...(input.expectedNonce ? { nonce: input.expectedNonce } : {}),
    });
    const result: CompleteAuthorizationCodeCallbackResult = {
      tokens,
      idToken,
      sessionIdentity: toSessionIdentity({ idToken }),
    };
    if (input.fetchUserInfo) {
      result.userInfo = await this.getUserInfo({
        accessToken: tokens.accessToken,
      });
      result.sessionIdentity = toSessionIdentity({
        idToken,
        userInfo: result.userInfo,
      });
    }
    return result;
  }

  async verifyIdToken(input: {
    idToken: string;
    nonce?: string;
  }): Promise<VerifiedIdToken> {
    const discovery = await this.getDiscovery();
    const [encodedHeader, encodedPayload, encodedSignature] =
      input.idToken.split(".");
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new ServerSdkError("oidc_invalid_token", "Invalid ID Token");
    }

    const header = decodeJson(encodedHeader);
    const claims = decodeJson(encodedPayload);
    if (header.alg !== "RS256" || typeof header.kid !== "string") {
      throw new ServerSdkError("oidc_invalid_token", "Unsupported ID Token");
    }

    const jwks = await this.getJwks();
    const jwk = jwks.keys.find((key) => key.kid === header.kid);
    if (!jwk) {
      throw new ServerSdkError("oidc_invalid_token", "Signing key not found");
    }

    const verified = verify(
      "RSA-SHA256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      createPublicKey({ key: jwk, format: "jwk" }),
      base64UrlToBuffer(encodedSignature),
    );
    if (!verified) {
      throw new ServerSdkError(
        "oidc_invalid_token",
        "Invalid ID Token signature",
      );
    }

    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== discovery.issuer) {
      throw new ServerSdkError("oidc_invalid_token", "Invalid issuer");
    }
    const audience = claims.aud;
    if (
      audience !== this.options.clientId &&
      !(Array.isArray(audience) && audience.includes(this.options.clientId))
    ) {
      throw new ServerSdkError("oidc_invalid_token", "Invalid audience");
    }
    if (
      Array.isArray(audience) &&
      audience.length > 1 &&
      claims.azp !== this.options.clientId
    ) {
      throw new ServerSdkError(
        "oidc_invalid_token",
        "Invalid authorized party",
      );
    }
    if (typeof claims.exp !== "number" || claims.exp <= now) {
      throw new ServerSdkError("oidc_invalid_token", "ID Token is expired");
    }
    if (input.nonce && claims.nonce !== input.nonce) {
      throw new ServerSdkError("oidc_invalid_token", "Invalid nonce");
    }
    if (typeof claims.sub !== "string") {
      throw new ServerSdkError("oidc_invalid_token", "Missing subject");
    }

    const verifiedToken: VerifiedIdToken = {
      sub: claims.sub,
      claims,
    };
    if (typeof claims.email === "string") {
      verifiedToken.email = claims.email;
    }
    if (typeof claims.email_verified === "boolean") {
      verifiedToken.emailVerified = claims.email_verified;
    }
    return verifiedToken;
  }

  async getUserInfo(input: {
    accessToken: string;
  }): Promise<Record<string, unknown>> {
    const discovery = await this.getDiscovery();
    if (!discovery.userinfo_endpoint) {
      throw new ServerSdkError("oidc_unsupported", "UserInfo is not supported");
    }

    const response = await this.requestJson(discovery.userinfo_endpoint, {
      headers: { authorization: `Bearer ${input.accessToken}` },
    });
    return response;
  }

  async introspectToken(input: {
    token: string;
    tokenTypeHint?: "access_token" | "refresh_token";
  }): Promise<TokenIntrospectionResult> {
    const discovery = await this.getDiscovery();
    if (!discovery.introspection_endpoint) {
      throw new ServerSdkError(
        "oidc_unsupported",
        "Token introspection is not supported",
      );
    }

    const body: Record<string, string> = { token: input.token };
    if (input.tokenTypeHint) {
      body.token_type_hint = input.tokenTypeHint;
    }
    const response = await this.postForm(
      discovery.introspection_endpoint,
      body,
    );
    return {
      active: response.active === true,
      ...(typeof response.scope === "string" ? { scope: response.scope } : {}),
      ...(typeof response.client_id === "string"
        ? { clientId: response.client_id }
        : {}),
      ...(typeof response.sub === "string" ? { sub: response.sub } : {}),
      ...(typeof response.exp === "number" ? { exp: response.exp } : {}),
      ...(typeof response.iat === "number" ? { iat: response.iat } : {}),
      claims: response,
    };
  }

  async revokeToken(input: {
    token: string;
    tokenTypeHint?: "access_token" | "refresh_token";
  }): Promise<void> {
    const discovery = await this.getDiscovery();
    if (!discovery.revocation_endpoint) {
      throw new ServerSdkError(
        "oidc_unsupported",
        "Token revocation is not supported",
      );
    }

    const body: Record<string, string> = { token: input.token };
    if (input.tokenTypeHint) {
      body.token_type_hint = input.tokenTypeHint;
    }
    await this.postFormVoid(discovery.revocation_endpoint, body);
  }

  async createLogoutUrl(input?: {
    postLogoutRedirectUri?: string;
    idTokenHint?: string;
    state?: string;
  }): Promise<string> {
    const discovery = await this.getDiscovery();
    if (!discovery.end_session_endpoint) {
      throw new ServerSdkError("oidc_unsupported", "Logout is not supported");
    }

    const url = new URL(discovery.end_session_endpoint);
    if (input?.postLogoutRedirectUri) {
      url.searchParams.set(
        "post_logout_redirect_uri",
        input.postLogoutRedirectUri,
      );
    }
    if (input?.idTokenHint) {
      url.searchParams.set("id_token_hint", input.idTokenHint);
    }
    if (input?.state) {
      url.searchParams.set("state", input.state);
    }
    return url.toString();
  }

  async logout(input: LogoutInput): Promise<LogoutResult> {
    const warnings: string[] = [];
    let refreshTokenRevoked = false;
    let accessTokenRevoked = false;
    let localSessionCleared = false;

    if (input.refreshToken) {
      try {
        await this.revokeToken({
          token: input.refreshToken,
          tokenTypeHint: "refresh_token",
        });
        refreshTokenRevoked = true;
      } catch (error) {
        warnings.push(
          `refresh_token_revoke_failed:${error instanceof ServerSdkError ? error.code : "unknown"}`,
        );
      }
    }

    if (input.accessToken) {
      try {
        await this.revokeToken({
          token: input.accessToken,
          tokenTypeHint: "access_token",
        });
        accessTokenRevoked = true;
      } catch (error) {
        warnings.push(
          `access_token_revoke_failed:${error instanceof ServerSdkError ? error.code : "unknown"}`,
        );
      }
    }

    try {
      await input.clearLocalSession();
      localSessionCleared = true;
    } catch (error) {
      warnings.push(
        `local_session_clear_failed:${error instanceof Error ? error.message : "unknown"}`,
      );
      throw error;
    }

    const result: LogoutResult = {
      localSessionCleared,
      refreshTokenRevoked,
      accessTokenRevoked,
      warnings,
    };

    if (input.mode === "global") {
      try {
        result.logoutUrl = await this.createLogoutUrl({
          ...(input.postLogoutRedirectUri
            ? { postLogoutRedirectUri: input.postLogoutRedirectUri }
            : {}),
          ...(input.idTokenHint ? { idTokenHint: input.idTokenHint } : {}),
          ...(input.state ? { state: input.state } : {}),
        });
      } catch (error) {
        warnings.push(
          `global_logout_url_failed:${error instanceof ServerSdkError ? error.code : "unknown"}`,
        );
      }
    }

    return result;
  }

  private async getDiscovery(): Promise<DiscoveryDocument> {
    if (!this.discoveryCache) {
      const issuer = this.options.issuer.replace(/\/$/, "");
      this.discoveryCache = (await this.requestJson(
        `${issuer}/.well-known/openid-configuration`,
      )) as DiscoveryDocument;
    }
    return this.discoveryCache;
  }

  private async getJwks(): Promise<Jwks> {
    if (!this.jwksCache) {
      const discovery = await this.getDiscovery();
      this.jwksCache = (await this.requestJson(discovery.jwks_uri)) as Jwks;
    }
    return this.jwksCache;
  }

  private async postForm(
    url: string,
    body: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    return this.requestJson(url, {
      method: "POST",
      headers: {
        authorization: toBasic(
          this.options.clientId,
          this.options.clientSecret,
        ),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body).toString(),
    });
  }

  private async postFormVoid(
    url: string,
    body: Record<string, string>,
  ): Promise<void> {
    await this.request(url, {
      method: "POST",
      headers: {
        authorization: toBasic(
          this.options.clientId,
          this.options.clientSecret,
        ),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body).toString(),
    });
  }

  private async requestJson(
    url: string,
    init: RequestInit = {},
  ): Promise<Record<string, unknown>> {
    const response = await this.request(url, init);
    return response.json() as Promise<Record<string, unknown>>;
  }

  private async request(
    url: string,
    init: RequestInit = {},
  ): Promise<Response> {
    return withTimeout(this.timeoutMs, async (signal) => {
      const response = await this.fetchImpl(url, { ...init, signal });
      if (!response.ok) {
        throw new ServerSdkError(
          response.status === 429 ? "oidc_rate_limited" : "oidc_http_error",
          `OIDC request failed with status ${response.status}`,
          response.status === 429 || response.status >= 500,
        );
      }
      return response;
    });
  }
}

export const createServerSdkClient = (options: ServerSdkOptions) =>
  new ServerSdkClient(options);

class JwtVerifier {
  private discoveryCache?: DiscoveryDocument;
  private jwksCache?: Jwks;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly clockSkewSeconds: number;

  constructor(private readonly options: JwtVerifierOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.clockSkewSeconds = options.clockSkewSeconds ?? 30;
  }

  async verifyAccessToken(
    token: string,
    input: VerifyAccessTokenInput = {},
  ): Promise<VerifiedServiceAccessToken> {
    if (!token) {
      throw new ServerSdkError("missing_token", "Access token is required");
    }

    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new ServerSdkError("invalid_token", "Invalid access token format");
    }

    const header = this.decodeJwtPart(encodedHeader);
    const claims = this.decodeJwtPart(encodedPayload);

    if (header.alg !== "RS256" || typeof header.kid !== "string") {
      throw new ServerSdkError("invalid_token", "Unsupported token algorithm");
    }

    const jwks = await this.getJwks();
    const jwk = jwks.keys.find((key) => key.kid === header.kid);
    if (!jwk) {
      throw new ServerSdkError("invalid_token", "Signing key not found");
    }

    const signatureValid = verify(
      "RSA-SHA256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      createPublicKey({ key: jwk, format: "jwk" }),
      base64UrlToBuffer(encodedSignature),
    );
    if (!signatureValid) {
      throw new ServerSdkError("invalid_token", "Invalid token signature");
    }

    this.validateClaims(claims);

    const scope = this.normalizeScope(claims);
    const requiredScopes = input.requiredScopes ?? [];
    if (requiredScopes.length > 0) {
      const missing = requiredScopes.filter(
        (required) => !scope.includes(required),
      );
      if (missing.length > 0) {
        throw new ServerSdkError(
          "insufficient_scope",
          `Missing required scopes: ${missing.join(", ")}`,
        );
      }
    }

    const verifiedToken: VerifiedServiceAccessToken = {
      claims,
      scope,
    };
    if (typeof claims.sub === "string") {
      verifiedToken.sub = claims.sub;
    }
    if (typeof claims.client_id === "string") {
      verifiedToken.clientId = claims.client_id;
    } else if (typeof claims.azp === "string") {
      verifiedToken.clientId = claims.azp;
    }
    return verifiedToken;
  }

  private decodeJwtPart(value: string): Record<string, unknown> {
    try {
      return JSON.parse(base64UrlToBuffer(value).toString("utf8"));
    } catch (_error) {
      throw new ServerSdkError("invalid_token", "Invalid token JSON");
    }
  }

  private validateClaims(claims: Record<string, unknown>) {
    const now = Math.floor(Date.now() / 1000);

    if (claims.iss !== this.options.issuer) {
      throw new ServerSdkError("invalid_token", "Invalid issuer");
    }

    const audience = claims.aud;
    const audienceMatches =
      audience === this.options.audience ||
      (Array.isArray(audience) && audience.includes(this.options.audience));
    if (!audienceMatches) {
      throw new ServerSdkError("invalid_token", "Invalid audience");
    }

    if (typeof claims.exp !== "number") {
      throw new ServerSdkError("invalid_token", "Missing exp claim");
    }
    if (claims.exp <= now - this.clockSkewSeconds) {
      throw new ServerSdkError("token_expired", "Access token is expired");
    }

    if (
      typeof claims.nbf === "number" &&
      claims.nbf > now + this.clockSkewSeconds
    ) {
      throw new ServerSdkError("invalid_token", "Token is not active yet");
    }

    if (
      typeof claims.iat === "number" &&
      claims.iat > now + this.clockSkewSeconds
    ) {
      throw new ServerSdkError("invalid_token", "Token issued-at is invalid");
    }
  }

  private normalizeScope(claims: Record<string, unknown>): string[] {
    if (typeof claims.scope === "string") {
      return claims.scope
        .split(" ")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
    }
    if (Array.isArray(claims.scp)) {
      return claims.scp.filter(
        (value): value is string => typeof value === "string",
      );
    }
    return [];
  }

  private async getDiscovery(): Promise<DiscoveryDocument> {
    if (!this.discoveryCache) {
      const issuer = this.options.issuer.replace(/\/$/, "");
      this.discoveryCache = (await this.requestJson(
        `${issuer}/.well-known/openid-configuration`,
      )) as DiscoveryDocument;
    }
    return this.discoveryCache;
  }

  private async getJwks(): Promise<Jwks> {
    if (!this.jwksCache) {
      if (this.options.jwksUri) {
        this.jwksCache = (await this.requestJson(this.options.jwksUri)) as Jwks;
      } else {
        const discovery = await this.getDiscovery();
        this.jwksCache = (await this.requestJson(discovery.jwks_uri)) as Jwks;
      }
    }
    return this.jwksCache;
  }

  private async requestJson(url: string): Promise<Record<string, unknown>> {
    return withTimeout(this.timeoutMs, async (signal) => {
      const response = await this.fetchImpl(url, { signal });
      if (!response.ok) {
        throw new ServerSdkError(
          response.status === 429 ? "oidc_rate_limited" : "oidc_http_error",
          `OIDC request failed with status ${response.status}`,
          response.status === 429 || response.status >= 500,
        );
      }
      return response.json() as Promise<Record<string, unknown>>;
    });
  }
}

export const createJwtVerifier = (options: JwtVerifierOptions) =>
  new JwtVerifier(options);

const readAuthorizationHeader = (
  headers: Headers | Record<string, string | undefined>,
): string | undefined => {
  if (headers instanceof Headers) {
    return headers.get("authorization") ?? undefined;
  }
  return headers.authorization ?? headers.Authorization;
};

export const createAuthMiddleware = (options: ServiceAuthMiddlewareOptions) => {
  const verifier = createJwtVerifier(options);
  return {
    async authorize(
      headers: Headers | Record<string, string | undefined>,
      input: VerifyAccessTokenInput = {},
    ): Promise<VerifiedServiceAccessToken> {
      const authorizationHeader = readAuthorizationHeader(headers);
      if (!authorizationHeader) {
        throw new ServerSdkError(
          "missing_token",
          "Authorization header is required",
        );
      }
      const [scheme, token] = authorizationHeader.split(" ");
      if (scheme?.toLowerCase() !== "bearer" || !token) {
        throw new ServerSdkError("missing_token", "Bearer token is required");
      }

      const requiredScopes =
        input.requiredScopes ?? options.requiredScopes ?? [];
      return verifier.verifyAccessToken(token, { requiredScopes });
    },
  };
};

const hasValidAccessTokenResponse = (
  response: Record<string, unknown>,
): response is Record<string, unknown> & {
  access_token: string;
  expires_in: number;
} => {
  return (
    typeof response.access_token === "string" &&
    typeof response.expires_in === "number" &&
    Number.isFinite(response.expires_in) &&
    response.expires_in > 0
  );
};

export const toSessionIdentity = (input: {
  idToken: VerifiedIdToken;
  userInfo?: Record<string, unknown>;
}): SessionIdentity => {
  const mergedClaims = {
    ...input.idToken.claims,
    ...(input.userInfo ?? {}),
  };
  return {
    userId: input.idToken.sub,
    ...(typeof mergedClaims.email === "string"
      ? { email: mergedClaims.email }
      : {}),
    ...(typeof mergedClaims.email_verified === "boolean"
      ? { emailVerified: mergedClaims.email_verified }
      : {}),
    permissions: stringArray(mergedClaims.permissions),
    entitlements: recordValue(mergedClaims.entitlements),
    claims: mergedClaims,
  };
};

export type AuthorizationCheckRequest = {
  action: string;
  resource: string;
  organizationId?: string;
  groupId?: string;
};

export type AuthorizationCheckResponse = {
  allowed: boolean;
  permissionKey: string;
  source?: "role" | "none";
};

export type EntitlementCheckRequest = {
  key: string;
  organizationId?: string;
  groupId?: string;
  quantity?: number;
};

export type EntitlementCheckResponse = {
  granted: boolean;
  key: string;
  source: "user" | "group" | "organization" | "none";
  value?: Record<string, unknown> | boolean;
  reason: string;
};
