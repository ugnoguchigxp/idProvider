import { createHmac, timingSafeEqual } from "node:crypto";
import type { SessionIdentity } from "@idp/server-sdk";

export const oauthStateCookieName = "example_bff_oidc";
export const sessionCookieName = "example_bff_session";

export type CookieSecurity = {
  secure: boolean;
  sameSite: "Lax" | "Strict" | "None";
};

export type PendingOidcState = {
  state: string;
  nonce: string;
  codeVerifier: string;
  createdAt: number;
};

export type LocalSession = {
  identity: SessionIdentity;
  createdAt: number;
  expiresAt: number;
};

type CookieOptions = CookieSecurity & {
  httpOnly: boolean;
  path?: string;
  maxAge?: number;
};

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

const sign = (payload: string, secret: string): string =>
  base64Url(createHmac("sha256", secret).update(payload).digest());

export const seal = (value: unknown, secret: string): string => {
  const payload = base64Url(JSON.stringify(value));
  return `${payload}.${sign(payload, secret)}`;
};

export const unseal = <T>(sealed: string | undefined, secret: string): T => {
  if (!sealed) {
    throw new Error("missing_cookie");
  }
  const [payload, signature] = sealed.split(".");
  if (!payload || !signature) {
    throw new Error("invalid_cookie");
  }

  const expected = sign(payload, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error("invalid_cookie_signature");
  }

  return JSON.parse(base64UrlToBuffer(payload).toString("utf8")) as T;
};

export const parseCookies = (
  cookieHeader: string | undefined,
): Record<string, string> => {
  if (!cookieHeader) {
    return {};
  }
  const cookies: Record<string, string> = {};
  for (const item of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = item.trim().split("=");
    if (!rawName) {
      continue;
    }
    const value = rawValue.join("=");
    try {
      cookies[rawName] = decodeURIComponent(value);
    } catch (_error) {
      cookies[rawName] = value;
    }
  }
  return cookies;
};

export const serializeCookie = (
  name: string,
  value: string,
  options: CookieOptions,
): string => {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path ?? "/"}`,
  ];
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  if (options.secure) {
    parts.push("Secure");
  }
  parts.push(`SameSite=${options.sameSite}`);
  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  return parts.join("; ");
};

export const clearCookie = (name: string, security: CookieSecurity): string =>
  serializeCookie(name, "", {
    ...security,
    httpOnly: true,
    maxAge: 0,
  });
