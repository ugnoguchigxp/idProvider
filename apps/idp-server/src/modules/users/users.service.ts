import { type DbClient, withTransaction } from "@idp/db";
import { ApiError, ok, type UpdateUserProfileRequest } from "@idp/shared";
import type pino from "pino";
import { hashPassword, verifyPassword } from "../../core/password.js";
import type { AuditRepository } from "../audit/audit.repository.js";
import type { IdentityRepository } from "./identity.repository.js";
import type { ProfileCache } from "./profile-cache.js";
import type { UserRepository } from "./user.repository.js";
import type { UserProfileRepository } from "./user-profile.repository.js";

export type UserServiceDependencies = {
  db: DbClient;
  userRepository: UserRepository;
  userProfileRepository: UserProfileRepository;
  profileCache: ProfileCache;
  identityRepository: IdentityRepository;
  auditRepository: AuditRepository;
  logger: pino.Logger;
};

const profileFieldToClaim = {
  displayName: "name",
  givenName: "given_name",
  familyName: "family_name",
  preferredUsername: "preferred_username",
  locale: "locale",
  zoneinfo: "zoneinfo",
} as const;

const isUniqueViolation = (error: unknown): boolean => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: string }).code
      : undefined;
  return code === "23505";
};

export class UserService {
  constructor(private deps: UserServiceDependencies) {}

  private async requireActiveUser(userId: string) {
    const user = await this.deps.userRepository.findById(userId);
    if (!user) throw new ApiError(404, "user_not_found", "User not found");
    if (user.status !== "active") {
      throw new ApiError(401, "unauthorized", "Account is not active");
    }
    return user;
  }

  async getMe(userId: string) {
    const user = await this.requireActiveUser(userId);
    return ok({
      userId: user.id,
      email: user.email ?? "",
      status: user.status,
      emailVerified: user.emailVerified ?? false,
      profile: {
        displayName: user.profile.displayName ?? null,
        givenName: user.profile.givenName ?? null,
        familyName: user.profile.familyName ?? null,
        preferredUsername: user.profile.preferredUsername ?? null,
        locale: user.profile.locale ?? null,
        zoneinfo: user.profile.zoneinfo ?? null,
      },
    });
  }

  async getOidcAccount(userId: string) {
    const user = await this.requireActiveUser(userId);
    return {
      userId: user.id,
      email: user.email ?? null,
      emailVerified: user.emailVerified ?? false,
      profile: {
        displayName: user.profile.displayName ?? null,
        givenName: user.profile.givenName ?? null,
        familyName: user.profile.familyName ?? null,
        preferredUsername: user.profile.preferredUsername ?? null,
        locale: user.profile.locale ?? null,
        zoneinfo: user.profile.zoneinfo ?? null,
      },
      profileUpdatedAt: user.profile.updatedAt ?? null,
    };
  }

  async updateProfile(userId: string, patch: UpdateUserProfileRequest) {
    await this.requireActiveUser(userId);

    if (patch.preferredUsername) {
      const taken =
        await this.deps.userProfileRepository.isPreferredUsernameTaken(
          patch.preferredUsername,
          userId,
        );
      if (taken) {
        throw new ApiError(
          409,
          "preferred_username_taken",
          "Preferred username is already taken",
        );
      }
    }

    const changedFields = Object.keys(patch).filter(
      (field): field is keyof typeof profileFieldToClaim =>
        field in profileFieldToClaim,
    );

    try {
      await withTransaction(this.deps.db, async (tx) => {
        await this.deps.userProfileRepository.upsert(userId, patch, tx);
        await this.deps.auditRepository.createAuditLog(
          {
            actorUserId: userId,
            action: "user.profile.updated",
            resourceType: "user",
            resourceId: userId,
            payload: {
              changedFields,
            },
          },
          tx,
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(
          409,
          "preferred_username_taken",
          "Preferred username is already taken",
        );
      }
      throw error;
    }

    await this.deps.profileCache.invalidate(userId);
    return this.getMe(userId);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    await this.verifyCurrentPassword(userId, currentPassword);

    await this.deps.userRepository.update(userId, {
      passwordHash: await hashPassword(newPassword),
    });
    return ok({ status: "changed" });
  }

  async verifyCurrentPassword(userId: string, password: string) {
    const user = await this.deps.userRepository.findWithPasswordById(userId);
    const isValidPassword = user
      ? await verifyPassword(password, user.passwordHash)
      : false;
    if (!user || !isValidPassword) {
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
