import { ApiError, ok } from "@idp/shared";
import type pino from "pino";
import type { AuditRepository } from "../audit/audit.repository.js";
import type { IdentityRepository } from "./identity.repository.js";
import type { UserRepository } from "./user.repository.js";

export type UserServiceDependencies = {
  userRepository: UserRepository;
  identityRepository: IdentityRepository;
  auditRepository: AuditRepository;
  logger: pino.Logger;
};

export class UserService {
  constructor(private deps: UserServiceDependencies) {}

  async getMe(userId: string) {
    const user = await this.deps.userRepository.findById(userId);
    if (!user) throw new ApiError(404, "user_not_found", "User not found");
    return ok(user);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    await this.verifyCurrentPassword(userId, currentPassword);

    await this.deps.userRepository.update(userId, {
      passwordHash: newPassword,
    });
    return ok({ status: "changed" });
  }

  async verifyCurrentPassword(userId: string, password: string) {
    const user = await this.deps.userRepository.findWithPasswordById(userId);
    if (!user || user.passwordHash !== password) {
      throw new ApiError(
        401,
        "invalid_password",
        "Current password is incorrect",
      );
    }
  }

  async linkGoogleIdentity(_params: {
    userId: string;
    idToken: string;
    clientId: string;
  }) {
    // Logic to verify Google ID token and link
    return ok({ status: "linked" });
  }

  async unlinkSocialIdentity(
    userId: string,
    provider: string,
    subject: string,
  ) {
    await this.deps.identityRepository.delete(userId, provider, subject);
    return ok({ status: "unlinked" });
  }
}
