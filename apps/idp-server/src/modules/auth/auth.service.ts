import type { ConfigService } from "@idp/auth-core";
import { ApiError, ok } from "@idp/shared";
import { OAuth2Client } from "google-auth-library";
import type pino from "pino";
import type { AppEnv } from "../../config/env.js";
import { recordLoginResult } from "../../core/metrics.js";
import { hashPassword, verifyPassword } from "../../core/password.js";
import type { RateLimiter } from "../../core/rate-limiter.js";
import { createOpaqueToken, hashOpaqueToken } from "../../core/tokens.js";
import type { AuditRepository } from "../audit/audit.repository.js";
import type { MfaService } from "../mfa/mfa.service.js";
import type { MfaRecoveryService } from "../mfa/mfa-recovery.service.js";
import type { RBACService } from "../rbac/rbac.service.js";
import type { SessionRepository } from "../sessions/session.repository.js";
import type { IdentityRepository } from "../users/identity.repository.js";
import type { UserRepository } from "../users/user.repository.js";
import type { AuthRepository } from "./auth.repository.js";
import type { VerificationRepository } from "./verification.repository.js";

export type AuthServiceDependencies = {
  authRepository: AuthRepository;
  verificationRepository: VerificationRepository;
  userRepository: UserRepository;
  identityRepository: IdentityRepository;
  sessionRepository: SessionRepository;
  rbacService: RBACService;
  auditRepository: AuditRepository;
  mfaService: MfaService;
  mfaRecoveryService: MfaRecoveryService;
  configService: ConfigService;
  rateLimiter: RateLimiter;
  env: AppEnv;
  logger: pino.Logger;
};

export class AuthService {
  constructor(private deps: AuthServiceDependencies) {}

  private async createSecurityEvent(
    eventType: string,
    userId: string | null,
    payload: Record<string, unknown> = {},
  ) {
    try {
      await this.deps.auditRepository.createSecurityEvent({
        eventType,
        userId,
        payload,
      });
    } catch (error: unknown) {
      this.deps.logger.error(
        { eventType, userId, error },
        "failed to persist security event",
      );
    }
  }

  private async enforceMfaForLogin(
    userId: string,
    ipAddress: string | null,
    mfa?:
      | {
          mfaCode?: string | undefined;
          mfaFactorId?: string | undefined;
          mfaRecoveryCode?: string | undefined;
        }
      | undefined,
  ) {
    const mfaEnabled = await this.deps.mfaService.hasEnabledMfa(userId);
    if (!mfaEnabled) {
      return false;
    }

    if (mfa?.mfaRecoveryCode) {
      const rate = await this.deps.rateLimiter.consume(
        `mfa-recovery:${userId}`,
        this.deps.env.RATE_LIMIT_MFA_RECOVERY_PER_MIN,
        60,
      );
      const ipRate = await this.deps.rateLimiter.consume(
        `mfa-recovery-ip:${ipAddress ?? "unknown"}`,
        this.deps.env.RATE_LIMIT_MFA_RECOVERY_PER_MIN,
        60,
      );
      if (!rate.allowed || !ipRate.allowed) {
        throw new ApiError(
          429,
          "rate_limited",
          "Too many MFA recovery attempts",
        );
      }
      await this.deps.mfaRecoveryService.consumeCode(
        userId,
        mfa.mfaRecoveryCode,
      );
      return true;
    }

    if (mfa?.mfaCode && mfa.mfaFactorId) {
      await this.deps.mfaService.verifyMfa(
        userId,
        mfa.mfaFactorId,
        mfa.mfaCode,
        {
          issueRecoveryCodes: false,
        },
      );
      return true;
    }

    throw new ApiError(401, "mfa_required", "MFA verification is required");
  }

  async signup(email: string, password: string, displayName: string) {
    const existing = await this.deps.userRepository.findByEmail(email);
    if (existing)
      throw new ApiError(409, "email_exists", "Email already registered");

    const passwordHash = await hashPassword(password);
    const user = await this.deps.userRepository.create({
      email,
      passwordHash,
      displayName,
    });

    const verificationToken = createOpaqueToken("ev");
    await this.deps.verificationRepository.createEmailToken({
      userId: user.id,
      tokenHash: hashOpaqueToken(verificationToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    return ok({ user, verificationToken });
  }

  async login(
    email: string,
    password: string,
    ipAddress: string | null,
    userAgent: string | null,
    mfa?: {
      mfaCode?: string | undefined;
      mfaFactorId?: string | undefined;
      mfaRecoveryCode?: string | undefined;
    },
  ) {
    if (mfa?.mfaCode && mfa.mfaRecoveryCode) {
      throw new ApiError(
        400,
        "mfa_method_conflict",
        "Use either MFA code or recovery code",
      );
    }

    const user = await this.deps.userRepository.findWithPasswordByEmail(email);
    const isValidPassword = user
      ? await verifyPassword(password, user.passwordHash)
      : false;
    if (!user || !isValidPassword) {
      recordLoginResult({ result: "failed", mfaEnabled: false });
      await this.deps.authRepository.recordAttempt(email, false, ipAddress);
      await this.createSecurityEvent("login.failed", null, {
        email,
        ipAddress,
        reason: "invalid_credentials",
      });
      throw new ApiError(
        401,
        "invalid_credentials",
        "Invalid email or password",
      );
    }

    await this.deps.authRepository.recordAttempt(email, true, ipAddress);

    if (user.status !== "active") {
      recordLoginResult({ result: "failed", mfaEnabled: false });
      await this.createSecurityEvent("login.failed", user.id, {
        email,
        ipAddress,
        reason: "inactive_user",
        status: user.status,
      });
      throw new ApiError(
        401,
        "invalid_credentials",
        "Invalid email or password",
      );
    }

    const mfaEnabled = await this.deps.mfaService.hasEnabledMfa(user.id);
    if (mfaEnabled && !mfa?.mfaCode && !mfa?.mfaRecoveryCode) {
      return ok({ mfaRequired: true, userId: user.id });
    }
    if (mfaEnabled) {
      await this.enforceMfaForLogin(user.id, ipAddress, mfa);
    }

    const session = await this.createSession(user.id, ipAddress, userAgent);
    recordLoginResult({ result: "success", mfaEnabled });
    await this.createSecurityEvent("login.success", user.id, {
      email,
      ipAddress,
      mfaEnabled,
    });
    return ok({
      status: "ok",
      userId: user.id,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      accessExpiresAt: session.accessExpiresAt,
      refreshExpiresAt: session.refreshExpiresAt,
      mfaEnabled,
    });
  }

  async refresh(refreshToken: string) {
    const tokenHash = hashOpaqueToken(refreshToken);
    const session =
      await this.deps.sessionRepository.findByRefreshTokenHash(tokenHash);
    if (!session) {
      await this.createSecurityEvent("refresh_token.reuse_detected", null, {
        reason: "token_not_found",
      });
      throw new ApiError(
        401,
        "invalid_token",
        "Invalid or expired refresh token",
      );
    }

    if (session.userStatus !== "active") {
      throw new ApiError(401, "unauthorized", "Account is not active");
    }

    const nextAccessToken = createOpaqueToken("at");
    const nextRefreshToken = createOpaqueToken("rt");
    const accessExpiresAt = new Date(
      Date.now() + this.deps.env.ACCESS_TOKEN_TTL_SECONDS * 1000,
    );
    const refreshExpiresAt = new Date(
      Date.now() + this.deps.env.REFRESH_TOKEN_TTL_SECONDS * 1000,
    );

    const rotated = await this.deps.sessionRepository.rotateTokens(
      session.id,
      tokenHash,
      {
        accessTokenHash: hashOpaqueToken(nextAccessToken),
        refreshTokenHash: hashOpaqueToken(nextRefreshToken),
        expiresAt: accessExpiresAt,
        refreshExpiresAt,
      },
    );
    if (!rotated) {
      await this.deps.sessionRepository.revoke(session.id);
      await this.createSecurityEvent(
        "refresh_token.reuse_detected",
        session.userId,
        {
          sessionId: session.id,
        },
      );
      throw new ApiError(401, "invalid_token", "Refresh token reuse detected");
    }

    return ok({
      userId: session.userId,
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      accessExpiresAt: accessExpiresAt.toISOString(),
      refreshExpiresAt: refreshExpiresAt.toISOString(),
    });
  }

  async logout(sessionId: string) {
    await this.deps.sessionRepository.revoke(sessionId);
    return ok({ status: "logged_out" });
  }

  async revokeByToken(token: string) {
    const tokenHash = hashOpaqueToken(token);
    const accessSession =
      await this.deps.sessionRepository.findByAccessTokenHash(tokenHash);
    if (accessSession) {
      await this.deps.sessionRepository.revoke(accessSession.id);
      return ok({ status: "accepted" });
    }

    const refreshSession =
      await this.deps.sessionRepository.findByRefreshTokenHash(tokenHash);
    if (refreshSession) {
      await this.deps.sessionRepository.revoke(refreshSession.id);
    }

    return ok({ status: "accepted" });
  }

  async introspectToken(token: string) {
    const tokenHash = hashOpaqueToken(token);
    const session =
      await this.deps.sessionRepository.findByAccessTokenHashAny(tokenHash);

    if (!session) {
      return ok({ active: false });
    }

    const active =
      !session.revokedAt &&
      session.expiresAt > new Date() &&
      session.userStatus === "active";

    if (!active) {
      return ok({ active: false });
    }

    const snapshot = await this.deps.rbacService.getAuthorizationSnapshot(
      session.userId,
    );
    return ok({
      active: true,
      sub: session.userId,
      sid: session.id,
      exp: Math.floor(session.expiresAt.getTime() / 1000),
      permissions: snapshot.permissions,
      entitlements: snapshot.entitlements,
    });
  }

  async authenticateAccessToken(accessToken: string) {
    const tokenHash = hashOpaqueToken(accessToken);
    const session =
      await this.deps.sessionRepository.findByAccessTokenHash(tokenHash);

    if (!session || session.expiresAt < new Date()) {
      throw new ApiError(
        401,
        "unauthorized",
        "Invalid or expired access token",
      );
    }

    if (session.userStatus !== "active") {
      throw new ApiError(401, "unauthorized", "Account is not active");
    }

    await this.deps.sessionRepository.updateLastSeen(session.id);

    return { userId: session.userId, sessionId: session.id };
  }

  async requestEmailVerification(email: string) {
    const user = await this.deps.userRepository.findByEmail(email);
    if (!user || user.status !== "active") {
      return ok({ status: "accepted", accepted: true });
    }

    const token = createOpaqueToken("ev");
    await this.deps.verificationRepository.createEmailToken({
      userId: user.id,
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    return ok({ status: "accepted", accepted: true, token });
  }

  async confirmEmailVerification(token: string) {
    const consumed =
      await this.deps.verificationRepository.consumeValidEmailTokenByHash(
        hashOpaqueToken(token),
      );
    if (!consumed) {
      throw new ApiError(400, "invalid_token", "Invalid or expired token");
    }

    const user = await this.deps.userRepository.findById(consumed.userId);
    if (!user || user.status !== "active") {
      throw new ApiError(401, "unauthorized", "Account is not active");
    }

    await this.deps.userRepository.update(consumed.userId, {
      emailVerified: true,
    });
    return ok({ status: "verified" });
  }

  async requestPasswordReset(email: string) {
    const user = await this.deps.userRepository.findByEmail(email);
    if (!user || user.status !== "active") return ok({ status: "accepted" });

    const token = createOpaqueToken("pr");
    await this.deps.verificationRepository.createPasswordToken({
      userId: user.id,
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    return ok({ status: "accepted", token });
  }

  async confirmPasswordReset(token: string, newPassword: string) {
    const consumed =
      await this.deps.verificationRepository.consumeValidPasswordTokenByHash(
        hashOpaqueToken(token),
      );
    if (!consumed) {
      throw new ApiError(400, "invalid_token", "Invalid or expired token");
    }
    const user = await this.deps.userRepository.findById(consumed.userId);
    if (!user || user.status !== "active") {
      throw new ApiError(401, "unauthorized", "Account is not active");
    }

    await this.deps.userRepository.update(consumed.userId, {
      passwordHash: await hashPassword(newPassword),
    });
    return ok({ status: "reset" });
  }

  async createSessionForUser(
    userId: string,
    ipAddress: string | null,
    userAgent: string | null,
  ) {
    const user = await this.deps.userRepository.findById(userId);
    if (!user || user.status !== "active") {
      throw new ApiError(401, "unauthorized", "Account is not active");
    }

    const session = await this.createSession(userId, ipAddress, userAgent);
    return ok({
      status: "ok",
      userId,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      accessExpiresAt: session.accessExpiresAt,
      refreshExpiresAt: session.refreshExpiresAt,
      mfaEnabled: true,
    });
  }

  async loginWithGoogle(
    input: {
      idToken: string;
      ipAddress: string | null;
      userAgent: string | null;
    } & {
      mfaCode?: string | undefined;
      mfaFactorId?: string | undefined;
      mfaRecoveryCode?: string | undefined;
    },
  ) {
    if (input.mfaCode && input.mfaRecoveryCode) {
      throw new ApiError(
        400,
        "mfa_method_conflict",
        "Use either MFA code or recovery code",
      );
    }

    const socialConfig =
      await this.deps.configService.getSocialLoginConfig("google");
    if (!socialConfig.providerEnabled) {
      throw new ApiError(403, "provider_disabled", "Google login is disabled");
    }
    const clientId = socialConfig.clientId || this.deps.env.GOOGLE_CLIENT_ID;
    const client = new OAuth2Client(clientId);
    let payload:
      | { sub?: string; email?: string; email_verified?: boolean }
      | undefined;
    try {
      const ticket = await client.verifyIdToken({
        idToken: input.idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new ApiError(
        400,
        "invalid_google_token",
        "Invalid Google ID token",
      );
    }

    if (!payload?.sub || !payload.email || !payload.email_verified) {
      throw new ApiError(
        400,
        "invalid_google_token",
        "Invalid Google ID token",
      );
    }

    const email = payload.email.toLowerCase();
    const provider = "google";
    const providerSubject = payload.sub;

    const existingIdentity = await this.deps.identityRepository.findByProvider(
      provider,
      providerSubject,
    );

    let userId: string;
    if (existingIdentity) {
      userId = existingIdentity.userId;
    } else {
      const existingUser = await this.deps.userRepository.findByEmail(email);
      if (existingUser) {
        if (existingUser.status !== "active") {
          throw new ApiError(
            401,
            "invalid_credentials",
            "Invalid authentication request",
          );
        }
        userId = existingUser.id;
      } else {
        const created = await this.deps.userRepository.createWithoutPassword({
          email,
          emailVerified: true,
          status: "active",
        });
        userId = created.id;
      }

      await this.deps.identityRepository.create({
        userId,
        provider,
        providerSubject,
        email,
      });
    }

    const user = await this.deps.userRepository.findById(userId);
    if (!user || user.status !== "active") {
      throw new ApiError(
        401,
        "invalid_credentials",
        "Invalid authentication request",
      );
    }

    const hasLocalPassword = Boolean(
      await this.deps.userRepository.findWithPasswordById(userId),
    );
    let mfaEnabled = false;
    if (hasLocalPassword) {
      mfaEnabled = await this.deps.mfaService.hasEnabledMfa(userId);
      if (mfaEnabled && !input.mfaCode && !input.mfaRecoveryCode) {
        return ok({ mfaRequired: true, userId });
      }
      if (mfaEnabled) {
        await this.enforceMfaForLogin(userId, input.ipAddress, {
          mfaCode: input.mfaCode,
          mfaFactorId: input.mfaFactorId,
          mfaRecoveryCode: input.mfaRecoveryCode,
        });
      }
    }

    const session = await this.createSession(
      userId,
      input.ipAddress,
      input.userAgent,
    );
    await this.createSecurityEvent("login.success", userId, {
      provider: "google",
      email,
      ipAddress: input.ipAddress,
      mfaEnabled,
    });
    return ok({
      status: "ok",
      userId,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      accessExpiresAt: session.accessExpiresAt,
      refreshExpiresAt: session.refreshExpiresAt,
      mfaEnabled,
    });
  }

  private async createSession(
    userId: string,
    ipAddress: string | null,
    userAgent: string | null,
  ) {
    const accessToken = createOpaqueToken("at");
    const refreshToken = createOpaqueToken("rt");
    const expiresAt = new Date(
      Date.now() + this.deps.env.ACCESS_TOKEN_TTL_SECONDS * 1000,
    );
    const refreshExpiresAt = new Date(
      Date.now() + this.deps.env.REFRESH_TOKEN_TTL_SECONDS * 1000,
    );

    const session = await this.deps.sessionRepository.create({
      userId,
      accessTokenHash: hashOpaqueToken(accessToken),
      refreshTokenHash: hashOpaqueToken(refreshToken),
      expiresAt,
      refreshExpiresAt,
      ipAddress,
      userAgent,
    });

    return {
      sessionId: session?.id,
      accessToken,
      refreshToken,
      accessExpiresAt: expiresAt.toISOString(),
      refreshExpiresAt: refreshExpiresAt.toISOString(),
    };
  }
}
