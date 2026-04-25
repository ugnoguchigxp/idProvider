export interface ProfileCache {
  invalidate(userId: string): Promise<void>;
}

export class NoopProfileCache implements ProfileCache {
  async invalidate(_userId: string): Promise<void> {
    // No profile cache in the current deployment.
  }
}
