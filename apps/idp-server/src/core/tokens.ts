import { createHash, randomBytes } from "node:crypto";

export const createOpaqueToken = (prefix: string): string => {
  const value = randomBytes(48).toString("base64url");
  return `${prefix}_${value}`;
};

export const hashOpaqueToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");
