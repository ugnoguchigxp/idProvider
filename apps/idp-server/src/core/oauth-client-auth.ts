import { timingSafeEqual } from "node:crypto";
import { ApiError } from "@idp/shared";

type OAuthClientCredentials = {
  clientId: string;
  clientSecret: string;
};

const safeEqualString = (left: string, right: string): boolean => {
  const leftBuf = Buffer.from(left, "utf8");
  const rightBuf = Buffer.from(right, "utf8");
  if (leftBuf.length !== rightBuf.length) {
    return false;
  }
  return timingSafeEqual(leftBuf, rightBuf);
};

export const assertOAuthClientAuth = (
  authorization: string | undefined,
  credentials: OAuthClientCredentials,
): void => {
  if (!authorization?.startsWith("Basic ")) {
    throw new ApiError(
      401,
      "invalid_client",
      "OAuth client authentication required",
    );
  }

  const encoded = authorization.slice("Basic ".length).trim();
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separator = decoded.indexOf(":");

  if (separator < 1) {
    throw new ApiError(
      401,
      "invalid_client",
      "Invalid client credentials format",
    );
  }

  const clientId = decoded.slice(0, separator);
  const clientSecret = decoded.slice(separator + 1);

  if (
    !safeEqualString(clientId, credentials.clientId) ||
    !safeEqualString(clientSecret, credentials.clientSecret)
  ) {
    throw new ApiError(
      401,
      "invalid_client",
      "Invalid OAuth client credentials",
    );
  }
};
