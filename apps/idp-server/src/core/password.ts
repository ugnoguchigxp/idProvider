import argon2 from "argon2";

const argon2Prefix = "$argon2";

export const hashPassword = async (password: string): Promise<string> => {
  return argon2.hash(password, { type: argon2.argon2id });
};

export const verifyPassword = async (
  password: string,
  storedHash: string,
): Promise<boolean> => {
  if (storedHash.startsWith(argon2Prefix)) {
    return argon2.verify(storedHash, password);
  }
  return storedHash === password;
};
