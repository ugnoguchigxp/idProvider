import {
  type AuthorizationCheckRequest,
  type AuthorizationCheckResponse,
  type AuthorizationUrlResult,
  type CompleteAuthorizationCodeCallbackResult,
  createServerSdkClient,
  type EntitlementCheckRequest,
  type EntitlementCheckResponse,
  type RefreshTokenSet,
  ServerSdkError,
  type ServerSdkOptions,
  type SessionIdentity,
  type TokenIntrospectionResult,
  type TokenSet,
  type VerifiedIdToken,
} from "@idp/server-sdk";

export type OidcClientSdkOptions = ServerSdkOptions;
export type OidcBeginLoginInput = {
  redirectUri: string;
  scope?: string[];
  state?: string;
  nonce?: string;
};

export type OidcCompleteCallbackInput = {
  code?: string | null;
  state?: string | null;
  expectedState: string;
  expectedNonce?: string;
  redirectUri: string;
  codeVerifier: string;
  fetchUserInfo?: boolean;
};

export type OidcErrorCategory =
  | "callback"
  | "token"
  | "network"
  | "rate_limit"
  | "unsupported"
  | "unknown";

export type OidcClientSdkError = {
  code: string;
  message: string;
  retryable: boolean;
  category: OidcErrorCategory;
};

const toErrorCategory = (code: string): OidcErrorCategory => {
  if (code === "oidc_invalid_callback") return "callback";
  if (code === "oidc_unsupported") return "unsupported";
  if (code === "oidc_timeout" || code === "oidc_http_error") return "network";
  if (code === "oidc_rate_limited") return "rate_limit";
  if (code.startsWith("oidc_invalid_")) return "token";
  return "unknown";
};

export const normalizeOidcClientError = (
  error: unknown,
): OidcClientSdkError => {
  if (error instanceof ServerSdkError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      category: toErrorCategory(error.code),
    };
  }

  return {
    code: "oidc_unknown_error",
    message: error instanceof Error ? error.message : "Unknown error",
    retryable: false,
    category: "unknown",
  };
};

export class OidcClientSdk {
  private readonly serverSdk: ReturnType<typeof createServerSdkClient>;

  constructor(options: OidcClientSdkOptions) {
    this.serverSdk = createServerSdkClient(options);
  }

  async beginLogin(
    input: OidcBeginLoginInput,
  ): Promise<AuthorizationUrlResult> {
    return this.serverSdk.createAuthorizationUrl(input);
  }

  async exchangeCode(input: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<TokenSet> {
    return this.serverSdk.exchangeCode(input);
  }

  async completeCallback(
    input: OidcCompleteCallbackInput,
  ): Promise<CompleteAuthorizationCodeCallbackResult> {
    return this.serverSdk.completeAuthorizationCodeCallback(input);
  }

  async verifyIdToken(input: {
    idToken: string;
    nonce?: string;
  }): Promise<VerifiedIdToken> {
    return this.serverSdk.verifyIdToken(input);
  }

  async getUserInfo(input: {
    accessToken: string;
  }): Promise<Record<string, unknown>> {
    return this.serverSdk.getUserInfo(input);
  }

  async refreshToken(input: {
    refreshToken: string;
    scope?: string[];
  }): Promise<RefreshTokenSet> {
    return this.serverSdk.refreshTokens(input);
  }

  async introspectToken(input: {
    token: string;
    tokenTypeHint?: "access_token" | "refresh_token";
  }): Promise<TokenIntrospectionResult> {
    return this.serverSdk.introspectToken(input);
  }

  async revokeToken(input: {
    token: string;
    tokenTypeHint?: "access_token" | "refresh_token";
  }): Promise<void> {
    return this.serverSdk.revokeToken(input);
  }

  async createLogoutUrl(input?: {
    postLogoutRedirectUri?: string;
    idTokenHint?: string;
    state?: string;
  }): Promise<string> {
    return this.serverSdk.createLogoutUrl(input);
  }
}

export const createOidcClientSdk = (options: OidcClientSdkOptions) =>
  new OidcClientSdk(options);

export type {
  AuthorizationCheckRequest,
  AuthorizationCheckResponse,
  EntitlementCheckRequest,
  EntitlementCheckResponse,
  SessionIdentity,
};
