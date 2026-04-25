type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  path?: string;
  maxAge?: number;
};

const encode = (value: string) => encodeURIComponent(value);

export const serializeCookie = (
  name: string,
  value: string,
  options: CookieOptions = {},
): string => {
  const parts = [`${name}=${encode(value)}`];
  parts.push(`Path=${options.path ?? "/"}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  return parts.join("; ");
};

export const clearCookie = (name: string, secure: boolean): string =>
  serializeCookie(name, "", {
    path: "/",
    httpOnly: name === "idp_access_token",
    secure,
    sameSite: "Lax",
    maxAge: 0,
  });
