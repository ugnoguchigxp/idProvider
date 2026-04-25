import { createHash, randomBytes } from "node:crypto";
import {
  and,
  auditLogs,
  type DbClient,
  type DbTransaction,
  desc,
  emailVerificationTokens,
  entitlements,
  eq,
  externalIdentities,
  groupMemberships,
  groupRoles,
  groups,
  gt,
  isNull,
  loginAttempts,
  mfaFactors,
  or,
  organizations,
  passwordResetTokens,
  permissions,
  rolePermissions,
  securityEvents,
  userEmails,
  userPasswords,
  userRoles,
  userSessions,
  users,
  withTransaction,
} from "@idp/db";
import { ApiError } from "@idp/shared";
import argon2 from "argon2";
import { OAuth2Client } from "google-auth-library";
import { authenticator } from "otplib";

export type AuthServiceOptions = {
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  argon2: {
    memoryCost: number;
    timeCost: number;
    parallelism: number;
  };
  mfaIssuer: string;
  onSecurityEvent?: (event: {
    eventType: string;
    userId: string | null;
    payload: Record<string, unknown>;
  }) => Promise<void> | void;
};

const DEFAULT_OPTIONS: AuthServiceOptions = {
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
  argon2: {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  },
  mfaIssuer: "gxp-idProvider",
};

const hashOpaqueToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

const createOpaqueToken = (prefix: string): string => {
  const value = randomBytes(48).toString("base64url");
  return `${prefix}_${value}`;
};

export type AuthenticatedPrincipal = {
  userId: string;
  sessionId: string;
};

type SessionTokenBundle = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  tokenClaims: AuthorizationSnapshot;
};

type EntitlementValue = Record<string, unknown> | boolean;

export type AuthorizationSnapshot = {
  permissions: string[];
  entitlements: Record<string, EntitlementValue>;
};

type EntitlementScope = "user" | "group" | "organization" | "none";

export class AuthService {
  private readonly options: AuthServiceOptions;

  constructor(
    private readonly db: DbClient,
    options?: Partial<AuthServiceOptions>,
  ) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      argon2: {
        ...DEFAULT_OPTIONS.argon2,
        ...(options?.argon2 ?? {}),
      },
    };
  }

  private async runInTransaction<T>(
    handler: (tx: DbTransaction | DbClient) => Promise<T>,
  ): Promise<T> {
    if (typeof this.db.transaction === "function") {
      return withTransaction(this.db, handler);
    }
    return handler(this.db);
  }

  private async writeSecurityEvent(
    eventType: string,
    userId: string | null,
    payload: Record<string, unknown>,
    db: DbTransaction | DbClient = this.db,
  ) {
    await db.insert(securityEvents).values({
      eventType,
      userId,
      payload,
    });
    await this.options.onSecurityEvent?.({
      eventType,
      userId,
      payload,
    });
  }

  private async writeAuditLog(
    input: {
      actorUserId: string | null;
      action: string;
      resourceType: string;
      resourceId?: string;
      payload: Record<string, unknown>;
    },
    db: DbTransaction | DbClient = this.db,
  ) {
    await db.insert(auditLogs).values({
      actorUserId: input.actorUserId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      payload: input.payload,
    });
  }

  private isEntitlementActive(expiresAt: Date | null): boolean {
    return expiresAt === null || expiresAt > new Date();
  }

  private normalizeEntitlementValue(value: unknown): EntitlementValue {
    if (typeof value === "boolean") {
      return value;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return { value };
  }

  private async listPermissionKeys(
    userId: string,
    context?: { organizationId?: string; groupId?: string },
  ): Promise<string[]> {
    const directRows = await this.db
      .select({ key: permissions.key })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(userRoles.userId, userId));

    const hasGroupFilter = Boolean(context?.groupId || context?.organizationId);
    const groupRows = await this.db
      .select({ key: permissions.key })
      .from(groupMemberships)
      .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
      .innerJoin(groupRoles, eq(groups.id, groupRoles.groupId))
      .innerJoin(rolePermissions, eq(groupRoles.roleId, rolePermissions.roleId))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(
        and(
          eq(groupMemberships.userId, userId),
          hasGroupFilter && context?.groupId
            ? eq(groups.id, context.groupId)
            : undefined,
          hasGroupFilter && context?.organizationId
            ? eq(groups.organizationId, context.organizationId)
            : undefined,
        ),
      );

    return [...new Set([...directRows, ...groupRows].map((row) => row.key))];
  }

  private async resolveEntitlementForKey(input: {
    userId: string;
    key: string;
    organizationId?: string;
    groupId?: string;
  }): Promise<{ value: EntitlementValue; scope: EntitlementScope } | null> {
    const now = new Date();
    const isActive = or(
      isNull(entitlements.expiresAt),
      gt(entitlements.expiresAt, now),
    );

    const userRows = await this.db
      .select({
        value: entitlements.value,
        enabled: entitlements.enabled,
        expiresAt: entitlements.expiresAt,
      })
      .from(entitlements)
      .where(
        and(
          eq(entitlements.key, input.key),
          eq(entitlements.userId, input.userId),
          eq(entitlements.enabled, true),
          isActive,
        ),
      )
      .orderBy(desc(entitlements.createdAt))
      .limit(1);
    const userEntitlement = userRows[0];
    if (
      userEntitlement &&
      this.isEntitlementActive(userEntitlement.expiresAt)
    ) {
      return {
        value: this.normalizeEntitlementValue(userEntitlement.value),
        scope: "user",
      };
    }

    const groupRows = await this.db
      .select({
        value: entitlements.value,
        enabled: entitlements.enabled,
        expiresAt: entitlements.expiresAt,
      })
      .from(entitlements)
      .innerJoin(groups, eq(entitlements.groupId, groups.id))
      .innerJoin(groupMemberships, eq(groups.id, groupMemberships.groupId))
      .where(
        and(
          eq(entitlements.key, input.key),
          eq(groupMemberships.userId, input.userId),
          eq(entitlements.enabled, true),
          isActive,
          input.groupId ? eq(groups.id, input.groupId) : undefined,
          input.organizationId
            ? eq(groups.organizationId, input.organizationId)
            : undefined,
        ),
      )
      .orderBy(desc(entitlements.createdAt))
      .limit(1);
    const groupEntitlement = groupRows[0];
    if (
      groupEntitlement &&
      this.isEntitlementActive(groupEntitlement.expiresAt)
    ) {
      return {
        value: this.normalizeEntitlementValue(groupEntitlement.value),
        scope: "group",
      };
    }

    if (!input.organizationId) {
      return null;
    }

    const organizationMembershipRows = await this.db
      .select({ organizationId: groups.organizationId })
      .from(groupMemberships)
      .innerJoin(groups, eq(groupMemberships.groupId, groups.id))
      .where(
        and(
          eq(groupMemberships.userId, input.userId),
          eq(groups.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (organizationMembershipRows.length === 0) {
      return null;
    }

    const organizationRows = await this.db
      .select({
        value: entitlements.value,
        enabled: entitlements.enabled,
        expiresAt: entitlements.expiresAt,
      })
      .from(entitlements)
      .innerJoin(
        organizations,
        eq(entitlements.organizationId, organizations.id),
      )
      .where(
        and(
          eq(entitlements.key, input.key),
          eq(entitlements.enabled, true),
          isActive,
          eq(organizations.id, input.organizationId),
        ),
      )
      .orderBy(desc(entitlements.createdAt))
      .limit(1);
    const organizationEntitlement = organizationRows[0];
    if (
      organizationEntitlement &&
      this.isEntitlementActive(organizationEntitlement.expiresAt)
    ) {
      return {
        value: this.normalizeEntitlementValue(organizationEntitlement.value),
        scope: "organization",
      };
    }

    return null;
  }

  async getAuthorizationSnapshot(
    userId: string,
    context?: { organizationId?: string; groupId?: string },
  ): Promise<AuthorizationSnapshot> {
    const permissionsResolved = await this.listPermissionKeys(userId, context);

    const entitlementRows = await this.db
      .select({ key: entitlements.key })
      .from(entitlements)
      .where(eq(entitlements.enabled, true));
    const uniqueKeys = [...new Set(entitlementRows.map((row) => row.key))];

    const entitlementMap: Record<string, EntitlementValue> = {};
    for (const key of uniqueKeys) {
      const resolved = await this.resolveEntitlementForKey({
        userId,
        key,
        ...(context?.organizationId
          ? { organizationId: context.organizationId }
          : {}),
        ...(context?.groupId ? { groupId: context.groupId } : {}),
      });
      if (resolved) {
        entitlementMap[key] = resolved.value;
      }
    }

    return {
      permissions: permissionsResolved,
      entitlements: entitlementMap,
    };
  }

  async getUserByEmail(email: string) {
    const result = await this.db
      .select({ id: users.id })
      .from(userEmails)
      .innerJoin(users, eq(userEmails.userId, users.id))
      .where(eq(userEmails.email, email))
      .limit(1);
    return result[0] ?? null;
  }

  async createSessionForUser(
    userId: string,
    ipAddress: string | null,
    userAgent: string | null,
  ) {
    return this.createSession(userId, ipAddress, userAgent);
  }

  private async createSession(
    userId: string,
    ipAddress: string | null,
    userAgent: string | null,
    db: DbTransaction | DbClient = this.db,
  ): Promise<SessionTokenBundle> {
    const accessToken = createOpaqueToken("at");
    const refreshToken = createOpaqueToken("rt");
    const accessExpiresAt = new Date(
      Date.now() + this.options.accessTokenTtlSeconds * 1000,
    );
    const refreshExpiresAt = new Date(
      Date.now() + this.options.refreshTokenTtlSeconds * 1000,
    );

    await db.insert(userSessions).values({
      userId,
      accessTokenHash: hashOpaqueToken(accessToken),
      refreshTokenHash: hashOpaqueToken(refreshToken),
      ipAddress,
      userAgent,
      expiresAt: accessExpiresAt,
      refreshExpiresAt: refreshExpiresAt,
    });

    const tokenClaims = await this.getAuthorizationSnapshot(userId);

    return {
      accessToken,
      refreshToken,
      accessExpiresAt: accessExpiresAt.toISOString(),
      refreshExpiresAt: refreshExpiresAt.toISOString(),
      tokenClaims,
    };
  }

  private async hasLocalPassword(
    userId: string,
    db: DbTransaction | DbClient = this.db,
  ): Promise<boolean> {
    const rows = await db
      .select({ userId: userPasswords.userId })
      .from(userPasswords)
      .where(eq(userPasswords.userId, userId))
      .limit(1);
    return rows.length > 0;
  }

  private assertValidTotpMfa(input: {
    factors: Array<{ id: string; type: string; secret: string | null }>;
    code: string | undefined;
    factorId: string | undefined;
  }): { factorId: string } {
    const totpFactors = input.factors.filter(
      (factor) => factor.type === "totp" && typeof factor.secret === "string",
    );

    if (!input.code) {
      throw new ApiError(
        401,
        "mfa_required",
        "MFA verification is required before login",
      );
    }

    const selectedFactor = input.factorId
      ? totpFactors.find((factor) => factor.id === input.factorId)
      : totpFactors[0];

    if (!selectedFactor?.secret) {
      throw new ApiError(
        401,
        "webauthn_mfa_required",
        "WebAuthn MFA verification is required before login",
      );
    }

    const validCode = authenticator.check(input.code, selectedFactor.secret);
    if (!validCode) {
      throw new ApiError(401, "invalid_mfa_code", "Invalid MFA code");
    }

    return { factorId: selectedFactor.id };
  }

  async signup(input: {
    email: string;
    password: string;
    displayName: string;
    ipAddress: string | null;
  }) {
    try {
      return await this.runInTransaction(async (tx) => {
        const inserted = await tx
          .insert(users)
          .values({ status: "active" })
          .returning({ id: users.id });
        const user = inserted[0];
        if (!user) {
          throw new ApiError(
            500,
            "user_create_failed",
            "Failed to create user",
          );
        }

        await tx.insert(userEmails).values({
          userId: user.id,
          email: input.email,
          isPrimary: true,
          isVerified: false,
        });

        const passwordHash = await argon2.hash(input.password, {
          type: argon2.argon2id,
          memoryCost: this.options.argon2.memoryCost,
          timeCost: this.options.argon2.timeCost,
          parallelism: this.options.argon2.parallelism,
        });

        await tx
          .insert(userPasswords)
          .values({ userId: user.id, passwordHash });

        const verificationToken = createOpaqueToken("ev");
        const verificationHash = hashOpaqueToken(verificationToken);
        const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60_000);

        await tx.insert(emailVerificationTokens).values({
          userId: user.id,
          tokenHash: verificationHash,
          expiresAt: verificationExpiresAt,
        });

        await this.writeSecurityEvent(
          "signup.created",
          user.id,
          {
            email: input.email,
            ipAddress: input.ipAddress,
            displayName: input.displayName,
          },
          tx,
        );

        await this.writeAuditLog(
          {
            actorUserId: user.id,
            action: "user.signup",
            resourceType: "user",
            resourceId: user.id,
            payload: {
              email: input.email,
              displayName: input.displayName,
            },
          },
          tx,
        );

        return {
          userId: user.id,
          email: input.email,
          verificationToken,
        };
      });
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "23505"
      ) {
        throw new ApiError(409, "email_already_exists", "Email already exists");
      }
      throw error;
    }
  }

  async login(input: {
    email: string;
    password: string;
    mfaCode?: string;
    mfaFactorId?: string;
    ipAddress: string | null;
    userAgent: string | null;
  }) {
    const result = await this.db
      .select({
        userId: users.id,
        passwordHash: userPasswords.passwordHash,
        emailVerified: userEmails.isVerified,
      })
      .from(userEmails)
      .innerJoin(users, eq(userEmails.userId, users.id))
      .innerJoin(userPasswords, eq(users.id, userPasswords.userId))
      .where(eq(userEmails.email, input.email))
      .limit(1);

    const row = result[0];
    if (!row) {
      await this.db.insert(loginAttempts).values({
        email: input.email,
        success: false,
        reason: "user_not_found",
        ipAddress: input.ipAddress,
      });
      throw new ApiError(
        401,
        "invalid_credentials",
        "Invalid email or password",
      );
    }

    const passwordValid = await argon2.verify(row.passwordHash, input.password);
    if (!passwordValid) {
      await this.db.insert(loginAttempts).values({
        email: input.email,
        success: false,
        reason: "invalid_password",
        ipAddress: input.ipAddress,
      });
      throw new ApiError(
        401,
        "invalid_credentials",
        "Invalid email or password",
      );
    }

    if (!row.emailVerified) {
      await this.db.insert(loginAttempts).values({
        email: input.email,
        success: false,
        reason: "email_not_verified",
        ipAddress: input.ipAddress,
      });
      throw new ApiError(
        403,
        "email_not_verified",
        "Email verification is required before login",
      );
    }

    const factors = await this.db
      .select({
        id: mfaFactors.id,
        type: mfaFactors.type,
        secret: mfaFactors.secret,
      })
      .from(mfaFactors)
      .where(
        and(eq(mfaFactors.userId, row.userId), eq(mfaFactors.enabled, true)),
      )
      .limit(20);

    const mfaEnabled = factors.length > 0;
    if (mfaEnabled) {
      const verified = this.assertValidTotpMfa({
        factors,
        code: input.mfaCode,
        factorId: input.mfaFactorId,
      });

      await this.writeSecurityEvent("mfa.login_verified", row.userId, verified);
    }

    const tokens = await this.createSession(
      row.userId,
      input.ipAddress,
      input.userAgent,
    );

    await this.db.insert(loginAttempts).values({
      email: input.email,
      success: true,
      reason: "ok",
      ipAddress: input.ipAddress,
    });

    await this.writeSecurityEvent("login.success", row.userId, {
      email: input.email,
      ipAddress: input.ipAddress,
      mfaEnabled,
    });

    if (!mfaEnabled) {
      await this.writeSecurityEvent("mfa.warning_shown", row.userId, {
        email: input.email,
      });
    }

    return {
      userId: row.userId,
      mfaEnabled,
      mfaWarning: mfaEnabled
        ? null
        : "MFA is required for all users. Enrollment is pending and strongly recommended now.",
      ...tokens,
    };
  }

  async authenticateAccessToken(
    accessToken: string,
  ): Promise<AuthenticatedPrincipal> {
    const tokenHash = hashOpaqueToken(accessToken);
    const rows = await this.db
      .select({
        sessionId: userSessions.id,
        userId: userSessions.userId,
        expiresAt: userSessions.expiresAt,
      })
      .from(userSessions)
      .where(
        and(
          eq(userSessions.accessTokenHash, tokenHash),
          isNull(userSessions.revokedAt),
          gt(userSessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    const session = rows[0];
    if (!session) {
      throw new ApiError(
        401,
        "unauthorized",
        "Invalid or expired access token",
      );
    }

    await this.db
      .update(userSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(userSessions.id, session.sessionId));

    return { userId: session.userId, sessionId: session.sessionId };
  }

  async refresh(refreshToken: string) {
    const tokenHash = hashOpaqueToken(refreshToken);
    return this.runInTransaction(async (tx) => {
      const rows = await tx
        .select({
          sessionId: userSessions.id,
          userId: userSessions.userId,
          refreshExpiresAt: userSessions.refreshExpiresAt,
        })
        .from(userSessions)
        .where(
          and(
            eq(userSessions.refreshTokenHash, tokenHash),
            isNull(userSessions.revokedAt),
            gt(userSessions.refreshExpiresAt, new Date()),
          ),
        )
        .limit(1);

      const session = rows[0];
      if (!session) {
        await this.writeSecurityEvent(
          "refresh_token.reuse_detected",
          null,
          { refreshTokenHash: tokenHash },
          tx,
        );
        throw new ApiError(
          401,
          "invalid_refresh_token",
          "Invalid refresh token",
        );
      }

      const nextAccessToken = createOpaqueToken("at");
      const nextRefreshToken = createOpaqueToken("rt");
      const accessExpiresAt = new Date(
        Date.now() + this.options.accessTokenTtlSeconds * 1000,
      );
      const refreshExpiresAt = new Date(
        Date.now() + this.options.refreshTokenTtlSeconds * 1000,
      );

      const updated = await tx
        .update(userSessions)
        .set({
          accessTokenHash: hashOpaqueToken(nextAccessToken),
          refreshTokenHash: hashOpaqueToken(nextRefreshToken),
          expiresAt: accessExpiresAt,
          refreshExpiresAt,
          lastSeenAt: new Date(),
        })
        .where(
          and(
            eq(userSessions.id, session.sessionId),
            eq(userSessions.refreshTokenHash, tokenHash),
          ),
        )
        .returning({ id: userSessions.id });

      if (updated.length === 0) {
        await tx
          .update(userSessions)
          .set({ revokedAt: new Date() })
          .where(eq(userSessions.id, session.sessionId));

        await this.writeSecurityEvent(
          "refresh_token.reuse_detected",
          session.userId,
          {
            sessionId: session.sessionId,
          },
          tx,
        );

        throw new ApiError(
          401,
          "invalid_refresh_token",
          "Refresh token reuse detected",
        );
      }

      const tokenClaims = await this.getAuthorizationSnapshot(session.userId);

      return {
        userId: session.userId,
        accessToken: nextAccessToken,
        refreshToken: nextRefreshToken,
        accessExpiresAt: accessExpiresAt.toISOString(),
        refreshExpiresAt: refreshExpiresAt.toISOString(),
        tokenClaims,
      };
    });
  }

  async getMe(userId: string) {
    const result = await this.db
      .select({
        userId: users.id,
        email: userEmails.email,
        status: users.status,
        emailVerified: userEmails.isVerified,
      })
      .from(users)
      .innerJoin(userEmails, eq(users.id, userEmails.userId))
      .where(and(eq(users.id, userId), eq(userEmails.isPrimary, true)))
      .limit(1);

    const me = result[0];
    if (!me) {
      throw new ApiError(404, "user_not_found", "User not found");
    }

    return me;
  }

  async verifyCurrentPassword(userId: string, password: string) {
    const result = await this.db
      .select({ passwordHash: userPasswords.passwordHash })
      .from(userPasswords)
      .where(eq(userPasswords.userId, userId))
      .limit(1);

    const row = result[0];
    if (!row) {
      throw new ApiError(
        404,
        "user_password_not_found",
        "User password not found",
      );
    }

    const valid = await argon2.verify(row.passwordHash, password);
    if (!valid) {
      throw new ApiError(401, "invalid_credentials", "Invalid password");
    }
  }

  async changePassword(input: {
    userId: string;
    currentPassword: string;
    newPassword: string;
  }) {
    await this.verifyCurrentPassword(input.userId, input.currentPassword);
    const passwordHash = await argon2.hash(input.newPassword, {
      type: argon2.argon2id,
      memoryCost: this.options.argon2.memoryCost,
      timeCost: this.options.argon2.timeCost,
      parallelism: this.options.argon2.parallelism,
    });

    await this.db
      .update(userPasswords)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(userPasswords.userId, input.userId));

    await this.db
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(userSessions.userId, input.userId),
          isNull(userSessions.revokedAt),
        ),
      );

    await this.writeSecurityEvent("password.changed", input.userId, {});
    await this.writeAuditLog({
      actorUserId: input.userId,
      action: "password.change",
      resourceType: "user",
      resourceId: input.userId,
      payload: {},
    });
  }

  async requestPasswordReset(email: string) {
    const account = await this.db
      .select({ userId: userEmails.userId })
      .from(userEmails)
      .where(eq(userEmails.email, email))
      .limit(1);

    const target = account[0];
    if (!target) {
      return { accepted: true };
    }

    const resetToken = createOpaqueToken("pr");
    const resetHash = hashOpaqueToken(resetToken);
    const expiresAt = new Date(Date.now() + 30 * 60_000);

    await this.db.insert(passwordResetTokens).values({
      userId: target.userId,
      tokenHash: resetHash,
      expiresAt,
    });

    await this.writeSecurityEvent(
      "password.reset.requested",
      target.userId,
      {},
    );

    // In production this token must be delivered through a trusted side channel (email/SMS).
    return {
      accepted: true,
      token: resetToken,
    };
  }

  async requestEmailVerification(email: string) {
    const account = await this.db
      .select({ userId: userEmails.userId, isVerified: userEmails.isVerified })
      .from(userEmails)
      .where(and(eq(userEmails.email, email), eq(userEmails.isPrimary, true)))
      .limit(1);

    const target = account[0];
    if (!target || target.isVerified) {
      return { accepted: true };
    }

    const token = createOpaqueToken("ev");
    await this.db.insert(emailVerificationTokens).values({
      userId: target.userId,
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    });

    await this.writeSecurityEvent(
      "email.verification.requested",
      target.userId,
      {},
    );

    return { accepted: true, token };
  }

  async confirmEmailVerification(token: string) {
    const tokenHash = hashOpaqueToken(token);
    await this.runInTransaction(async (tx) => {
      const records = await tx
        .select({
          id: emailVerificationTokens.id,
          userId: emailVerificationTokens.userId,
        })
        .from(emailVerificationTokens)
        .where(
          and(
            eq(emailVerificationTokens.tokenHash, tokenHash),
            isNull(emailVerificationTokens.consumedAt),
            gt(emailVerificationTokens.expiresAt, new Date()),
          ),
        )
        .limit(1);

      const row = records[0];
      if (!row) {
        throw new ApiError(
          400,
          "invalid_verification_token",
          "Invalid or expired verification token",
        );
      }

      await tx
        .update(userEmails)
        .set({ isVerified: true })
        .where(
          and(
            eq(userEmails.userId, row.userId),
            eq(userEmails.isPrimary, true),
          ),
        );

      await tx
        .update(emailVerificationTokens)
        .set({ consumedAt: new Date() })
        .where(eq(emailVerificationTokens.id, row.id));

      await this.writeSecurityEvent("email.verified", row.userId, {}, tx);
    });
  }

  async confirmPasswordReset(input: {
    resetToken: string;
    newPassword: string;
  }) {
    const tokenHash = hashOpaqueToken(input.resetToken);
    await this.runInTransaction(async (tx) => {
      const result = await tx
        .select({
          id: passwordResetTokens.id,
          userId: passwordResetTokens.userId,
        })
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.tokenHash, tokenHash),
            isNull(passwordResetTokens.consumedAt),
            gt(passwordResetTokens.expiresAt, new Date()),
          ),
        )
        .limit(1);

      const token = result[0];
      if (!token) {
        throw new ApiError(
          400,
          "invalid_reset_token",
          "Invalid or expired reset token",
        );
      }

      const passwordHash = await argon2.hash(input.newPassword, {
        type: argon2.argon2id,
        memoryCost: this.options.argon2.memoryCost,
        timeCost: this.options.argon2.timeCost,
        parallelism: this.options.argon2.parallelism,
      });

      await tx
        .update(userPasswords)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(userPasswords.userId, token.userId));

      await tx
        .update(userSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(userSessions.userId, token.userId),
            isNull(userSessions.revokedAt),
          ),
        );

      await tx
        .update(passwordResetTokens)
        .set({ consumedAt: new Date() })
        .where(eq(passwordResetTokens.id, token.id));

      await this.writeSecurityEvent(
        "password.changed",
        token.userId,
        {
          reason: "password_reset",
        },
        tx,
      );
    });
  }

  async logoutBySession(sessionId: string, userId: string) {
    await this.db
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(userSessions.id, sessionId), eq(userSessions.userId, userId)),
      );

    await this.writeSecurityEvent("logout.success", userId, { sessionId });
  }

  async revokeByToken(token: string) {
    const tokenHash = hashOpaqueToken(token);
    await this.db
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          isNull(userSessions.revokedAt),
          or(
            eq(userSessions.accessTokenHash, tokenHash),
            eq(userSessions.refreshTokenHash, tokenHash),
          ),
        ),
      );
  }

  async introspectToken(token: string) {
    const tokenHash = hashOpaqueToken(token);
    const rows = await this.db
      .select({
        userId: userSessions.userId,
        sessionId: userSessions.id,
        expiresAt: userSessions.expiresAt,
        revokedAt: userSessions.revokedAt,
      })
      .from(userSessions)
      .where(eq(userSessions.accessTokenHash, tokenHash))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return { active: false as const };
    }

    const active = row.revokedAt === null && row.expiresAt > new Date();
    if (!active) {
      return { active: false as const };
    }

    const tokenClaims = await this.getAuthorizationSnapshot(row.userId);

    return {
      active: true as const,
      sub: row.userId,
      sid: row.sessionId,
      exp: Math.floor(row.expiresAt.getTime() / 1000),
      permissions: tokenClaims.permissions,
      entitlements: tokenClaims.entitlements,
    };
  }

  async listSessions(userId: string) {
    return this.db
      .select({
        id: userSessions.id,
        ipAddress: userSessions.ipAddress,
        userAgent: userSessions.userAgent,
        lastSeenAt: userSessions.lastSeenAt,
        createdAt: userSessions.createdAt,
        expiresAt: userSessions.expiresAt,
        revokedAt: userSessions.revokedAt,
      })
      .from(userSessions)
      .where(eq(userSessions.userId, userId))
      .orderBy(desc(userSessions.createdAt));
  }

  async revokeSession(userId: string, sessionId: string) {
    await this.db
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(userSessions.userId, userId), eq(userSessions.id, sessionId)),
      );

    await this.writeAuditLog({
      actorUserId: userId,
      action: "session.revoke",
      resourceType: "session",
      resourceId: sessionId,
      payload: {},
    });
  }

  async revokeAllSessions(userId: string) {
    await this.db
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)),
      );

    await this.writeAuditLog({
      actorUserId: userId,
      action: "session.revoke_all",
      resourceType: "session",
      payload: {},
    });
  }

  async authorizationCheck(input: {
    userId: string;
    action: string;
    resource: string;
    organizationId?: string;
    groupId?: string;
  }) {
    const permissionKey = `${input.resource}:${input.action}`;
    const permissionKeys = await this.listPermissionKeys(input.userId, {
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      ...(input.groupId ? { groupId: input.groupId } : {}),
    });
    const allowed = permissionKeys.includes(permissionKey);

    return {
      allowed,
      permissionKey,
      source: allowed ? "role" : "none",
    };
  }

  async entitlementCheck(input: {
    userId: string;
    key: string;
    organizationId?: string;
    groupId?: string;
    quantity?: number;
  }) {
    const resolved = await this.resolveEntitlementForKey({
      userId: input.userId,
      key: input.key,
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      ...(input.groupId ? { groupId: input.groupId } : {}),
    });

    if (!resolved) {
      return {
        granted: false,
        key: input.key,
        source: "none" as EntitlementScope,
        reason: "not_found",
      };
    }

    const value = resolved.value;
    if (typeof value === "boolean") {
      return {
        granted: value,
        key: input.key,
        source: resolved.scope,
        value,
        reason: value ? "enabled" : "disabled",
      };
    }

    const quantityLimit = typeof value.max === "number" ? value.max : undefined;
    if (
      typeof quantityLimit === "number" &&
      typeof input.quantity === "number"
    ) {
      const granted = input.quantity <= quantityLimit;
      return {
        granted,
        key: input.key,
        source: resolved.scope,
        value,
        reason: granted ? "within_limit" : "limit_exceeded",
      };
    }

    const granted = typeof value.enabled === "boolean" ? value.enabled : true;
    return {
      granted,
      key: input.key,
      source: resolved.scope,
      value,
      reason: granted ? "enabled" : "disabled",
    };
  }

  async enrollMfa(userId: string) {
    const secret = randomBytes(20).toString("base64url");
    const inserted = await this.db
      .insert(mfaFactors)
      .values({
        userId,
        type: "totp",
        secret,
        enabled: false,
      })
      .returning({ id: mfaFactors.id, secret: mfaFactors.secret });

    const factor = inserted[0];
    if (!factor) {
      throw new ApiError(500, "mfa_enroll_failed", "Failed to enroll MFA");
    }

    const account = await this.getMe(userId);
    const provisioningUri = authenticator.keyuri(
      account.email,
      this.options.mfaIssuer,
      secret,
    );

    await this.writeSecurityEvent("mfa.enroll_started", userId, {
      factorId: factor.id,
    });
    return { ...factor, provisioningUri };
  }

  async verifyMfa(userId: string, factorId: string, code: string) {
    if (!/^\d{6}$/.test(code)) {
      throw new ApiError(400, "invalid_mfa_code", "MFA code must be 6 digits");
    }

    const factors = await this.db
      .select({ secret: mfaFactors.secret })
      .from(mfaFactors)
      .where(and(eq(mfaFactors.id, factorId), eq(mfaFactors.userId, userId)))
      .limit(1);

    const factor = factors[0];
    if (!factor) {
      throw new ApiError(404, "mfa_factor_not_found", "MFA factor not found");
    }

    if (!factor.secret) {
      throw new ApiError(400, "invalid_mfa_factor", "MFA factor has no secret");
    }

    const valid = authenticator.check(code, factor.secret);
    if (!valid) {
      throw new ApiError(400, "invalid_mfa_code", "MFA code is invalid");
    }

    const updated = await this.db
      .update(mfaFactors)
      .set({ enabled: true })
      .where(and(eq(mfaFactors.id, factorId), eq(mfaFactors.userId, userId)))
      .returning({ id: mfaFactors.id });

    if (updated.length === 0) {
      throw new ApiError(404, "mfa_factor_not_found", "MFA factor not found");
    }

    await this.writeSecurityEvent("mfa.enabled", userId, { factorId });
  }

  private async authenticateSocialIdentity(input: {
    provider: string;
    providerSubject: string;
    email: string;
    mfaCode: string | undefined;
    mfaFactorId: string | undefined;
    ipAddress: string | null;
    userAgent: string | null;
    db: DbTransaction | DbClient;
  }) {
    const {
      provider,
      providerSubject,
      email,
      mfaCode,
      mfaFactorId,
      ipAddress,
      userAgent,
      db,
    } = input;

    // 1. Check if this social identity is already linked
    const existingIdentity = await db
      .select({ userId: externalIdentities.userId })
      .from(externalIdentities)
      .where(
        and(
          eq(externalIdentities.provider, provider),
          eq(externalIdentities.providerSubject, providerSubject),
        ),
      )
      .limit(1);

    let userId: string;

    if (existingIdentity[0]) {
      userId = existingIdentity[0].userId;
    } else {
      // 2. Check if a user with this email already exists
      const existingUser = await db
        .select({ userId: userEmails.userId })
        .from(userEmails)
        .where(and(eq(userEmails.email, email), eq(userEmails.isPrimary, true)))
        .limit(1);

      if (existingUser[0]) {
        userId = existingUser[0].userId;
        // Auto-link if email matches (Trusting the social provider's verified email)
        await db.insert(externalIdentities).values({
          userId,
          provider,
          providerSubject,
          email,
          isEmailVerified: true,
        });
      } else {
        // 3. Create new user (Signup)
        const inserted = await db
          .insert(users)
          .values({ status: "active" })
          .returning({ id: users.id });
        const user = inserted[0];
        if (!user) {
          throw new ApiError(
            500,
            "user_create_failed",
            "Failed to create user",
          );
        }
        userId = user.id;

        await db.insert(userEmails).values({
          userId,
          email,
          isPrimary: true,
          isVerified: true,
        });

        await db.insert(externalIdentities).values({
          userId,
          provider,
          providerSubject,
          email,
          isEmailVerified: true,
        });

        await this.writeSecurityEvent(
          `signup.${provider}.created`,
          userId,
          { email, ipAddress },
          db,
        );
      }
    }

    const factors = await db
      .select({
        id: mfaFactors.id,
        type: mfaFactors.type,
        secret: mfaFactors.secret,
      })
      .from(mfaFactors)
      .where(and(eq(mfaFactors.userId, userId), eq(mfaFactors.enabled, true)))
      .limit(20);

    const mfaEnabled = factors.length > 0;
    const localPasswordAccount = await this.hasLocalPassword(userId, db);
    if (localPasswordAccount && mfaEnabled) {
      const verified = this.assertValidTotpMfa({
        factors,
        code: mfaCode,
        factorId: mfaFactorId,
      });

      await this.writeSecurityEvent(
        `mfa.${provider}.login_verified`,
        userId,
        verified,
        db,
      );
    }

    const tokens = await this.createSession(userId, ipAddress, userAgent, db);

    await this.writeSecurityEvent(
      `login.${provider}.success`,
      userId,
      { email, ipAddress, mfaEnabled },
      db,
    );

    return {
      userId,
      mfaEnabled,
      ...tokens,
    };
  }

  async loginWithGoogle(input: {
    idToken: string;
    clientId: string;
    mfaCode?: string;
    mfaFactorId?: string;
    ipAddress: string | null;
    userAgent: string | null;
  }) {
    const client = new OAuth2Client(input.clientId);
    const ticket = await client.verifyIdToken({
      idToken: input.idToken,
      audience: input.clientId,
    });
    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email) {
      throw new ApiError(
        400,
        "invalid_google_token",
        "Invalid Google ID Token",
      );
    }

    if (!payload.email_verified) {
      throw new ApiError(
        400,
        "google_email_not_verified",
        "Google account email must be verified",
      );
    }

    const email = payload.email.toLowerCase();

    return await this.runInTransaction(async (tx) => {
      return this.authenticateSocialIdentity({
        provider: "google",
        providerSubject: payload.sub,
        email,
        mfaCode: input.mfaCode,
        mfaFactorId: input.mfaFactorId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        db: tx,
      });
    });
  }

  async linkGoogleIdentity(input: {
    userId: string;
    idToken: string;
    clientId: string;
  }) {
    const client = new OAuth2Client(input.clientId);
    const ticket = await client.verifyIdToken({
      idToken: input.idToken,
      audience: input.clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new ApiError(
        400,
        "invalid_google_token",
        "Invalid Google ID Token",
      );
    }

    if (!payload.email_verified) {
      throw new ApiError(
        400,
        "google_email_not_verified",
        "Google account email must be verified",
      );
    }

    const providerSubject = payload.sub;
    const email = payload.email.toLowerCase();

    const user = await this.getMe(input.userId);
    if (user.email !== email) {
      throw new ApiError(
        400,
        "email_mismatch",
        `Google email (${email}) does not match your primary email (${user.email})`,
      );
    }

    const existing = await this.db
      .select({ id: externalIdentities.id, userId: externalIdentities.userId })
      .from(externalIdentities)
      .where(
        and(
          eq(externalIdentities.provider, "google"),
          eq(externalIdentities.providerSubject, providerSubject),
        ),
      )
      .limit(1);

    const mapped = existing[0];
    if (mapped) {
      if (mapped.userId === input.userId) {
        return;
      }
      throw new ApiError(
        409,
        "google_identity_in_use",
        "Google identity is already linked to another account",
      );
    }

    await this.runInTransaction(async (tx) => {
      await tx.insert(externalIdentities).values({
        userId: input.userId,
        provider: "google",
        providerSubject,
        email,
        isEmailVerified: true,
      });

      await this.writeSecurityEvent(
        "identity.google.linked",
        input.userId,
        {
          providerSubject,
          email,
        },
        tx,
      );

      await this.writeAuditLog(
        {
          actorUserId: input.userId,
          action: "identity.google.link",
          resourceType: "external_identity",
          resourceId: providerSubject,
          payload: { email },
        },
        tx,
      );
    });
  }

  async unlinkSocialIdentity(
    userId: string,
    provider: string,
    providerSubject: string,
  ) {
    await this.runInTransaction(async (tx) => {
      await tx
        .delete(externalIdentities)
        .where(
          and(
            eq(externalIdentities.userId, userId),
            eq(externalIdentities.provider, provider),
            eq(externalIdentities.providerSubject, providerSubject),
          ),
        );

      await this.writeSecurityEvent(
        `identity.${provider}.unlinked`,
        userId,
        {
          providerSubject,
        },
        tx,
      );

      await this.writeAuditLog(
        {
          actorUserId: userId,
          action: `identity.${provider}.unlink`,
          resourceType: "external_identity",
          resourceId: providerSubject,
          payload: {},
        },
        tx,
      );
    });
  }
}
