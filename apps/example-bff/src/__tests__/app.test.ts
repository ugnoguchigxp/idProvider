import { describe, expect, it, vi } from "vitest";
import { createExampleBffApp, type ExampleBffConfig } from "../app.js";
import { sessionCookieName } from "../session.js";

const config: ExampleBffConfig = {
  issuer: "https://login.example.com",
  clientId: "client",
  clientSecret: "secret",
  baseUrl: "https://app.example.com",
  sessionSecret: "test-session-secret-that-is-long-enough",
  sessionTtlSeconds: 3600,
  cookieSecurity: {
    secure: true,
    sameSite: "Lax",
  },
};

const cookiePair = (setCookie: string | null, name: string): string => {
  const cookie = setCookie
    ?.split(/,(?=[^;,]+=)/)
    .find((item) => item.trim().startsWith(`${name}=`));
  if (!cookie) {
    throw new Error(`missing ${name} cookie`);
  }
  return cookie.split(";")[0] ?? "";
};

describe("example-bff", () => {
  it("redirects to IdP and stores pending OIDC state in an httpOnly cookie", async () => {
    const sdk = {
      createAuthorizationUrl: vi.fn(async () => ({
        url: "https://login.example.com/auth?client_id=client",
        state: "state",
        nonce: "nonce",
        codeVerifier: "verifier",
      })),
      completeAuthorizationCodeCallback: vi.fn(),
      logout: vi.fn(),
    };
    const app = createExampleBffApp({ config, sdk });

    const response = await app.request("/login", { redirect: "manual" });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://login.example.com/auth?client_id=client",
    );
    expect(response.headers.get("set-cookie")).toContain("example_bff_oidc=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
  });

  it("completes callback and issues a local session cookie without storing OIDC tokens", async () => {
    const sdk = {
      createAuthorizationUrl: vi.fn(async () => ({
        url: "https://login.example.com/auth?client_id=client",
        state: "state",
        nonce: "nonce",
        codeVerifier: "verifier",
      })),
      completeAuthorizationCodeCallback: vi.fn(async () => ({
        tokens: {
          idToken: "id-token",
          accessToken: "access-token",
          refreshToken: "refresh-token",
          expiresIn: 300,
        },
        idToken: {
          sub: "user-1",
          email: "user@example.com",
          emailVerified: true,
          claims: {
            sub: "user-1",
            email: "user@example.com",
            email_verified: true,
          },
        },
        userInfo: {
          sub: "user-1",
          email: "user@example.com",
          email_verified: true,
        },
        sessionIdentity: {
          userId: "user-1",
          email: "user@example.com",
          emailVerified: true,
          permissions: [],
          entitlements: {},
          claims: {
            sub: "user-1",
            email: "user@example.com",
            email_verified: true,
          },
        },
      })),
      logout: vi.fn(),
    };
    const app = createExampleBffApp({ config, sdk });

    const loginResponse = await app.request("/login", { redirect: "manual" });
    const pendingCookie = cookiePair(
      loginResponse.headers.get("set-cookie"),
      "example_bff_oidc",
    );
    const callbackResponse = await app.request(
      "/callback?code=code&state=state",
      {
        headers: { cookie: pendingCookie },
        redirect: "manual",
      },
    );

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toBe("/");
    const setCookie = callbackResponse.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${sessionCookieName}=`);
    expect(setCookie).not.toContain("access-token");
    expect(setCookie).not.toContain("refresh-token");
    expect(setCookie).not.toContain("id-token");
    expect(sdk.completeAuthorizationCodeCallback).toHaveBeenCalledWith({
      code: "code",
      state: "state",
      expectedState: "state",
      expectedNonce: "nonce",
      redirectUri: "https://app.example.com/callback",
      codeVerifier: "verifier",
      fetchUserInfo: true,
    });

    const sessionCookie = cookiePair(setCookie, sessionCookieName);
    const meResponse = await app.request("/me", {
      headers: { cookie: sessionCookie },
    });
    expect(meResponse.status).toBe(200);
    await expect(meResponse.json()).resolves.toMatchObject({
      authenticated: true,
      identity: {
        userId: "user-1",
        email: "user@example.com",
      },
    });
  });

  it("rejects callback without the pending state cookie", async () => {
    const sdk = {
      createAuthorizationUrl: vi.fn(),
      completeAuthorizationCodeCallback: vi.fn(),
      logout: vi.fn(),
    };
    const app = createExampleBffApp({ config, sdk });

    const response = await app.request("/callback?code=code&state=state");

    expect(response.status).toBe(400);
    expect(sdk.completeAuthorizationCodeCallback).not.toHaveBeenCalled();
  });

  it("clears local session and pending state for local logout", async () => {
    const sdk = {
      createAuthorizationUrl: vi.fn(),
      completeAuthorizationCodeCallback: vi.fn(),
      logout: vi.fn(async (input: { clearLocalSession: () => void }) => {
        input.clearLocalSession();
        return {
          localSessionCleared: true,
          refreshTokenRevoked: false,
          accessTokenRevoked: false,
          warnings: [],
        };
      }),
    };
    const app = createExampleBffApp({ config, sdk });

    const response = await app.request("/logout", {
      method: "POST",
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${sessionCookieName}=`);
    expect(setCookie).toContain("example_bff_oidc=");
    expect(setCookie).toContain("Max-Age=0");
    expect(sdk.logout).toHaveBeenCalledWith({
      mode: "local",
      clearLocalSession: expect.any(Function),
    });
  });

  it("clears local session and redirects to IdP for global logout", async () => {
    const sdk = {
      createAuthorizationUrl: vi.fn(),
      completeAuthorizationCodeCallback: vi.fn(),
      logout: vi.fn(async (input: { clearLocalSession: () => void }) => {
        input.clearLocalSession();
        return {
          localSessionCleared: true,
          refreshTokenRevoked: false,
          accessTokenRevoked: false,
          logoutUrl: "https://login.example.com/logout",
          warnings: [],
        };
      }),
    };
    const app = createExampleBffApp({ config, sdk });

    const response = await app.request("/logout/global", {
      method: "POST",
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://login.example.com/logout",
    );
    expect(response.headers.get("set-cookie")).toContain(
      `${sessionCookieName}=`,
    );
    expect(response.headers.get("set-cookie")).toContain("example_bff_oidc=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(sdk.logout).toHaveBeenCalledWith({
      mode: "global",
      postLogoutRedirectUri: "https://app.example.com/",
      clearLocalSession: expect.any(Function),
    });
  });

  it("clears local session even when global logout URL is unavailable", async () => {
    const sdk = {
      createAuthorizationUrl: vi.fn(),
      completeAuthorizationCodeCallback: vi.fn(),
      logout: vi.fn(async (input: { clearLocalSession: () => void }) => {
        input.clearLocalSession();
        return {
          localSessionCleared: true,
          refreshTokenRevoked: false,
          accessTokenRevoked: false,
          warnings: ["global_logout_url_failed:oidc_unsupported"],
        };
      }),
    };
    const app = createExampleBffApp({ config, sdk });

    const response = await app.request("/logout/global", {
      method: "POST",
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${sessionCookieName}=`);
    expect(setCookie).toContain("example_bff_oidc=");
    expect(setCookie).toContain("Max-Age=0");
  });
});
