import type { RBACRepository } from "./rbac.repository.js";

export type EntitlementValue = Record<string, unknown> | boolean;

export type AuthorizationSnapshot = {
  permissions: string[];
  entitlements: Record<string, EntitlementValue>;
};

export class RBACService {
  constructor(private readonly rbacRepository: RBACRepository) {}

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

  async authorizationCheck(input: {
    userId: string;
    action: string;
    resource: string;
    organizationId?: string;
    groupId?: string;
  }) {
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

    return {
      allowed,
      permissionKey: requiredPermission,
      source: allowed ? "rbac" : null,
    };
  }

  async entitlementCheck(input: {
    userId: string;
    key: string;
    organizationId?: string;
    groupId?: string;
    quantity?: number;
  }) {
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
      return { allowed: false, reason: "not_entitled" };
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
        return { allowed: false, reason: "limit_exceeded", limit: current };
      }
    }

    return { allowed: true, value: resolved.value, scope: resolved.scope };
  }

  private normalizeEntitlementValue(value: unknown): EntitlementValue {
    if (typeof value === "boolean") return value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return { value };
  }
}
