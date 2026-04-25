import { ok } from "@idp/shared";
import type { SessionRepository } from "./session.repository.js";

export type SessionServiceDependencies = {
  sessionRepository: SessionRepository;
};

export class SessionService {
  constructor(private deps: SessionServiceDependencies) {}

  async listSessions(userId: string) {
    const sessions = await this.deps.sessionRepository.findAllByUserId(userId);
    return ok({ sessions });
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.deps.sessionRepository.findById(sessionId);
    if (session && session.userId === userId) {
      await this.deps.sessionRepository.revoke(sessionId);
    }
    return ok({ status: "revoked", sessionId });
  }

  async revokeAllSessions(userId: string) {
    await this.deps.sessionRepository.revokeAllByUserId(userId);
    return ok({ status: "revoked_all" });
  }
}
