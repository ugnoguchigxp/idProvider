import type { ConfigService } from "@idp/auth-core";
import { ApiError, ok } from "@idp/shared";
import type pino from "pino";
import type { AppEnv } from "../../config/env.js";
import { hashPassword, verifyPassword } from "../../core/password.js";
import type { RateLimiter } from "../../core/rate-limiter.js";
import { createOpaqueToken, hashOpaqueToken } from "../../core/tokens.js";
import type { AuditRepository } from "../audit/audit.repository.js";
import type { MfaService } from "../mfa/mfa.service.js";
import type { MfaRecoveryService } from "../mfa/mfa-recovery.service.js";
import type { RBACService } from "../rbac/rbac.service.js";
import type { SessionRepository } from "../sessions/session.repository.js";
import type { UserRepository } from "../users/user.repository.js";
import type { AuthRepository } from "./auth.repository.js";
import type { VerificationRepository } from "./verification.repository.js";

export type AuthServiceDependencies = {
  authRepository: AuthRepository;
  verificationRepository: VerificationRepository;
  userRepository: UserRepository;
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

  async signup(email: string, password: string, _displayName: string) {
    const existing = await this.deps.userRepository.findByEmail(email);
    if (existing)
      throw new ApiError(409, "email_exists", "Email already registered");

    const passwordHash = await hashPassword(password);
    const user = await this.deps.userRepository.create({
      email,
      passwordHash,
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
      await this.deps.authRepository.recordAttempt(email, false, ipAddress);
      throw new ApiError(
        401,
        "invalid_credentials",
        "Invalid email or password",
      );
    }

    await this.deps.authRepository.recordAttempt(email, true, ipAddress);

    if (user.status !== "active") {
      throw new ApiError(401, "unauthorized", "Account is not active");
    }

    const mfaEnabled = await this.deps.mfaService.hasEnabledMfa(user.id);
    if (mfaEnabled) {
      if (mfa?.mfaRecoveryCode) {
        const rate = await this.deps.rateLimiter.consume(
          `mfa-recovery:${user.id}`,
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
          user.id,
          mfa.mfaRecoveryCode,
        );
      } else if (mfa?.mfaCode && mfa.mfaFactorId) {
        await this.deps.mfaService.verifyMfa(
          user.id,
          mfa.mfaFactorId,
          mfa.mfaCode,
          { issueRecoveryCodes: false },
        );
      } else {
        return ok({ mfaRequired: true, userId: user.id });
      }
    }

    const session = await this.createSession(user.id, ipAddress, userAgent);
    return ok({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      mfaEnabled: false,
    });
  }

  async refresh(refreshToken: string) {
    const tokenHash = hashOpaqueToken(refreshToken);
    const session =
      await this.deps.sessionRepository.findByRefreshTokenHash(tokenHash);
    if (!session) {
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
      throw new ApiError(401, "invalid_token", "Refresh token reuse detected");
    }

    return ok({
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
    if (!user || user.status !== "active") return ok({ status: "accepted" });

    const token = createOpaqueToken("ev");
    await this.deps.verificationRepository.createEmailToken({
      userId: user.id,
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    return ok({ status: "accepted", token });
  }

  async confirmEmailVerification(token: string) {
    const hash = hashOpaqueToken(token);
    const ver = await this.deps.verificationRepository.findEmailToken(hash);
    if (!ver) {
      throw new ApiError(400, "invalid_token", "Invalid or expired token");
    }
    const user = await this.deps.userRepository.findById(ver.userId);
    if (!user || user.status !== "active") {
      throw new ApiError(401, "unauthorized", "Account is not active");
    }

    await this.deps.userRepository.update(ver.userId, { emailVerified: true });
    await this.deps.verificationRepository.consumeEmailToken(ver.id);
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
    const hash = hashOpaqueToken(token);
    const ver =
      await this.deps.verificationRepository.findPasswordResetToken(hash);
    if (!ver) {
      throw new ApiError(400, "invalid_token", "Invalid or expired token");
    }
    const user = await this.deps.userRepository.findById(ver.userId);
    if (!user || user.status !== "active") {
      throw new ApiError(401, "unauthorized", "Account is not active");
    }

    await this.deps.userRepository.update(ver.userId, {
      passwordHash: await hashPassword(newPassword),
    });
    await this.deps.verificationRepository.consumePasswordToken(ver.id);
    return ok({ status: "reset" });
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

    return { sessionId: session?.id, accessToken, refreshToken };
  }
}
