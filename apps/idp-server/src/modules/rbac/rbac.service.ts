import {
  observeRbacCacheLookupDuration,
  recordRbacAuthorizationDecision,
  recordRbacCacheError,
  recordRbacCacheHit,
  recordRbacCacheInvalidation,
  recordRbacCacheMiss,
  recordRbacEntitlementDecision,
} from "../../core/metrics.js";
import type { RBACRepository } from "./rbac.repository.js";
import { NoopRBACCache, type RBACCache } from "./rbac-cache.js";

export type EntitlementValue = Record<string, unknown> | boolean;

export type AuthorizationSnapshot = {
  permissions: string[];
  entitlements: Record<string, EntitlementValue>;
};

export class RBACService {
  private readonly cache: RBACCache;
  private readonly cacheEnabled: boolean;
  private readonly cachePercent: number;
  private readonly authTtlSeconds: number;
  private readonly entitlementTtlSeconds: number;
  private readonly negativeTtlSeconds: number;

  constructor(
    private readonly rbacRepository: RBACRepository,
    options?: {
      cache?: RBACCache;
      cacheEnabled?: boolean;
      cachePercent?: number;
      authTtlSeconds?: number;
      entitlementTtlSeconds?: number;
      negativeTtlSeconds?: number;
    },
  ) {
    this.cache = options?.cache ?? new NoopRBACCache();
    this.cacheEnabled = options?.cacheEnabled ?? false;
    this.cachePercent = options?.cachePercent ?? 0;
    this.authTtlSeconds = options?.authTtlSeconds ?? 30;
    this.entitlementTtlSeconds = options?.entitlementTtlSeconds ?? 60;
    this.negativeTtlSeconds = options?.negativeTtlSeconds ?? 15;
  }

  async getAuthorizationSnapshot(
    userId: string,
    context?: { organizationId?: string; groupId?: string },
  ): Promise<AuthorizationSnapshot> {
    const permissions = await this.rbacRepository.listPermissionKeys(
      userId,
      context,
    );
    const uniqueKeys = await this.rbacRepository.listAllActiveEntitlementKeys();

    const entitlementMap: Record<string, EntitlementValue> = {};
    for (const key of uniqueKeys) {
      const resolved = await this.rbacRepository.findEntitlement({
        userId,
        key,
        ...context,
      });
      if (resolved) {
        entitlementMap[key] = this.normalizeEntitlementValue(resolved.value);
      }
    }

    return {
      permissions,
      entitlements: entitlementMap,
    };
  }

  async getEffectivePermissions(
    userId: string,
    context?: { organizationId?: string; groupId?: string },
  ) {
    const permissions = await this.rbacRepository.listPermissionKeys(
      userId,
      context,
    );
    return [...new Set(permissions)].sort();
  }

  async getAdminAccessSnapshot(limit: number = 100) {
    return this.rbacRepository.listUsersWithPermissionPrefix("admin.", limit);
  }

  async authorizationCheck(input: {
    userId: string;
    action: string;
    resource: string;
    organizationId?: string;
    groupId?: string;
  }) {
    const shouldUseCache = this.shouldUseCache(input.userId);
    const cacheKey = this.buildAuthorizationCacheKey(input);
    if (shouldUseCache) {
      const start = performance.now();
      try {
        const cached = await this.cache.get<{
          allowed: boolean;
          permissionKey: string;
          source: "rbac" | null;
        }>(cacheKey);
        observeRbacCacheLookupDuration(
          "auth",
          (performance.now() - start) / 1000,
        );
        if (cached) {
          recordRbacCacheHit("auth");
          return cached;
        }
        recordRbacCacheMiss("auth");
      } catch (_error: unknown) {
        observeRbacCacheLookupDuration(
          "auth",
          (performance.now() - start) / 1000,
        );
        recordRbacCacheError("get");
      }
    }

    const permissions = await this.rbacRepository.listPermissionKeys(
      input.userId,
      {
        organizationId: input.organizationId,
        groupId: input.groupId,
      } as { organizationId?: string; groupId?: string },
    );

    const requiredPermission = `${input.resource}:${input.action}`;
    const resourceWildcardPermission = `${input.resource}:all`;
    const allowed =
      permissions.includes(requiredPermission) ||
      permissions.includes(resourceWildcardPermission) ||
      permissions.includes("*");

    const result = {
      allowed,
      permissionKey: requiredPermission,
      source: allowed ? "rbac" : null,
    };
    recordRbacAuthorizationDecision(result.allowed ? "allowed" : "denied");

    if (shouldUseCache) {
      try {
        await this.cache.set(
          cacheKey,
          result,
          result.allowed ? this.authTtlSeconds : this.negativeTtlSeconds,
        );
      } catch (_error: unknown) {
        recordRbacCacheError("set");
      }
    }

    return result;
  }

  async entitlementCheck(input: {
    userId: string;
    key: string;
    organizationId?: string;
    groupId?: string;
    quantity?: number;
  }) {
    const shouldUseCache = this.shouldUseCache(input.userId);
    const cacheKey = this.buildEntitlementCacheKey(input);
    if (shouldUseCache) {
      const start = performance.now();
      try {
        const cached = await this.cache.get<
          | {
              allowed: false;
              reason: "not_entitled" | "limit_exceeded";
              limit?: number;
            }
          | { allowed: true; value: unknown; scope: string }
        >(cacheKey);
        observeRbacCacheLookupDuration(
          "ent",
          (performance.now() - start) / 1000,
        );
        if (cached) {
          recordRbacCacheHit("ent");
          return cached;
        }
        recordRbacCacheMiss("ent");
      } catch (_error: unknown) {
        observeRbacCacheLookupDuration(
          "ent",
          (performance.now() - start) / 1000,
        );
        recordRbacCacheError("get");
      }
    }

    const resolved = await this.rbacRepository.findEntitlement({
      userId: input.userId,
      key: input.key,
      organizationId: input.organizationId,
      groupId: input.groupId,
    } as {
      userId: string;
      key: string;
      organizationId?: string;
      groupId?: string;
    });

    if (!resolved) {
      const result = {
        allowed: false as const,
        reason: "not_entitled" as const,
      };
      recordRbacEntitlementDecision("not_entitled");
      if (shouldUseCache) {
        try {
          await this.cache.set(cacheKey, result, this.negativeTtlSeconds);
        } catch (_error: unknown) {
          recordRbacCacheError("set");
        }
      }
      return result;
    }

    if (typeof input.quantity === "number") {
      // Logic for quantity check
      const current =
        typeof resolved.value === "object" &&
        resolved.value !== null &&
        "limit" in resolved.value
          ? Number((resolved.value as { limit: unknown }).limit)
          : Infinity;
      if (input.quantity > current) {
        const result = {
          allowed: false as const,
          reason: "limit_exceeded" as const,
          limit: current,
        };
        recordRbacEntitlementDecision("limit_exceeded");
        if (shouldUseCache) {
          try {
            await this.cache.set(cacheKey, result, this.negativeTtlSeconds);
          } catch (_error: unknown) {
            recordRbacCacheError("set");
          }
        }
        return result;
      }
    }

    const result = {
      allowed: true as const,
      value: resolved.value,
      scope: resolved.scope,
    };
    recordRbacEntitlementDecision("allowed");
    if (shouldUseCache) {
      try {
        await this.cache.set(cacheKey, result, this.entitlementTtlSeconds);
      } catch (_error: unknown) {
        recordRbacCacheError("set");
      }
    }
    return result;
  }

  async invalidateUserCache(userId: string): Promise<void> {
    try {
      await this.cache.deleteByPrefix(
        ["rbac", "v1", "auth", this.normalizeKeyPart(userId)].join(":"),
      );
      await this.cache.deleteByPrefix(
        ["rbac", "v1", "ent", this.normalizeKeyPart(userId)].join(":"),
      );
      recordRbacCacheInvalidation({ target: "user", result: "success" });
    } catch (_error: unknown) {
      recordRbacCacheError("del");
      recordRbacCacheInvalidation({ target: "user", result: "error" });
    }
  }

  async invalidateAllCache(): Promise<void> {
    try {
      await this.cache.deleteByPrefix("rbac:v1:");
      recordRbacCacheInvalidation({ target: "all", result: "success" });
    } catch (_error: unknown) {
      recordRbacCacheError("del");
      recordRbacCacheInvalidation({ target: "all", result: "error" });
    }
  }

  private shouldUseCache(userId: string): boolean {
    if (!this.cacheEnabled) return false;
    if (this.cachePercent <= 0) return false;
    if (this.cachePercent >= 100) return true;
    return this.bucket(userId) < this.cachePercent;
  }

  private bucket(value: string): number {
    let hash = 5381;
    for (const char of value) {
      hash = (hash * 33) ^ char.charCodeAt(0);
    }
    return Math.abs(hash) % 100;
  }

  private normalizeKeyPart(value: string | number | undefined): string {
    if (value === undefined || value === null) return "_";
    return String(value).trim().replace(/[:\s]/g, "_");
  }

  private buildAuthorizationCacheKey(input: {
    userId: string;
    resource: string;
    action: string;
    organizationId?: string;
    groupId?: string;
  }): string {
    return [
      "rbac",
      "v1",
      "auth",
      this.normalizeKeyPart(input.userId),
      this.normalizeKeyPart(input.resource),
      this.normalizeKeyPart(input.action),
      this.normalizeKeyPart(input.organizationId),
      this.normalizeKeyPart(input.groupId),
    ].join(":");
  }

  private buildEntitlementCacheKey(input: {
    userId: string;
    key: string;
    organizationId?: string;
    groupId?: string;
    quantity?: number;
  }): string {
    return [
      "rbac",
      "v1",
      "ent",
      this.normalizeKeyPart(input.userId),
      this.normalizeKeyPart(input.key),
      this.normalizeKeyPart(input.organizationId),
      this.normalizeKeyPart(input.groupId),
      this.normalizeKeyPart(input.quantity),
    ].join(":");
  }

  private normalizeEntitlementValue(value: unknown): EntitlementValue {
    if (typeof value === "boolean") return value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return { value };
  }
}
