import type { DbClient } from "@idp/db";
import { AuditRepository } from "../modules/audit/audit.repository.js";
import { AuthRepository } from "../modules/auth/auth.repository.js";
import { VerificationRepository } from "../modules/auth/verification.repository.js";
import { MfaRepository } from "../modules/mfa/mfa.repository.js";
import { MfaRecoveryRepository } from "../modules/mfa/mfa-recovery.repository.js";
import { RBACRepository } from "../modules/rbac/rbac.repository.js";
import { SessionRepository } from "../modules/sessions/session.repository.js";
import { AccountDeletionRepository } from "../modules/users/account-deletion.repository.js";
import { IdentityRepository } from "../modules/users/identity.repository.js";
import { UserRepository } from "../modules/users/user.repository.js";
import { UserProfileRepository } from "../modules/users/user-profile.repository.js";

export const createRepositories = (db: DbClient) => ({
  auditRepository: new AuditRepository(db),
  authRepository: new AuthRepository(db),
  verificationRepository: new VerificationRepository(db),
  userRepository: new UserRepository(db),
  userProfileRepository: new UserProfileRepository(db),
  identityRepository: new IdentityRepository(db),
  accountDeletionRepository: new AccountDeletionRepository(db),
  sessionRepository: new SessionRepository(db),
  mfaRepository: new MfaRepository(db),
  mfaRecoveryRepository: new MfaRecoveryRepository(db),
  rbacRepository: new RBACRepository(db),
});

export type AppRepositories = ReturnType<typeof createRepositories>;
