import { randomUUID } from "node:crypto";
import type { ConfigService } from "@idp/auth-core";
import { ApiError, ok } from "@idp/shared";
import type pino from "pino";
import type { AppEnv } from "../../config/env.js";
import { createOpaqueToken, hashOpaqueToken } from "../../core/tokens.js";
import type { AuditRepository } from "../audit/audit.repository.js";
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
  configService: ConfigService;
  env: AppEnv;
  logger: pino.Logger;
};

export class AuthService {
  constructor(private deps: AuthServiceDependencies) {}

  async signup(email: string, password: string, _displayName: string) {
    const existing = await this.deps.userRepository.findByEmail(email);
    if (existing)
      throw new ApiError(409, "email_exists", "Email already registered");

    // Password hashing (simplified)
    const passwordHash = password; // TODO: bcrypt
    const userId = randomUUID();

    const user = await this.deps.userRepository.create({
      email,
      passwordHash,
    });

    const verificationToken = createOpaqueToken("ev");
    await this.deps.verificationRepository.createEmailToken({
      userId,
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
  ) {
    const user = await this.deps.userRepository.findWithPasswordByEmail(email);
    if (!user || user.passwordHash !== password) {
      await this.deps.authRepository.recordAttempt(email, false, ipAddress);
      throw new ApiError(
        401,
        "invalid_credentials",
        "Invalid email or password",
      );
    }

    await this.deps.authRepository.recordAttempt(email, true, ipAddress);

    // Check MFA (simplified)
    const mfaEnabled = false;
    if (mfaEnabled) {
      return ok({ mfaRequired: true, userId: user.id });
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
    if (!session || session.expiresAt < new Date()) {
      throw new ApiError(
        401,
        "invalid_token",
        "Invalid or expired refresh token",
      );
    }

    const newAccessToken = createOpaqueToken("at");
    // Update session record...
    return ok({ accessToken: newAccessToken, refreshToken });
  }

  async logout(sessionId: string) {
    await this.deps.sessionRepository.revoke(sessionId);
    return ok({ status: "logged_out" });
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

    await this.deps.sessionRepository.updateLastSeen(session.id);

    return { userId: session.userId, sessionId: session.id };
  }

  async requestEmailVerification(email: string) {
    const user = await this.deps.userRepository.findByEmail(email);
    if (!user) return ok({ status: "accepted" });

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

    await this.deps.userRepository.update(ver.userId, { emailVerified: true });
    await this.deps.verificationRepository.consumeEmailToken(ver.id);
    return ok({ status: "verified" });
  }

  async requestPasswordReset(email: string) {
    const user = await this.deps.userRepository.findByEmail(email);
    if (!user) return ok({ status: "accepted" });

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

    await this.deps.userRepository.update(ver.userId, {
      passwordHash: newPassword,
    });
    await this.deps.verificationRepository.consumePasswordToken(ver.id);
    return ok({ status: "reset" });
  }

  private async createSession(
    userId: string,
    ipAddress: string | null,
    userAgent: string | null,
  ) {
    const _sessionId = randomUUID();
    const accessToken = createOpaqueToken("at");
    const refreshToken = createOpaqueToken("rt");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const session = await this.deps.sessionRepository.create({
      userId,
      accessTokenHash: hashOpaqueToken(accessToken),
      refreshTokenHash: hashOpaqueToken(refreshToken),
      expiresAt,
      refreshExpiresAt: expiresAt, // Placeholder
      ipAddress,
      userAgent,
    });

    return { sessionId: session?.id, accessToken, refreshToken };
  }
}
