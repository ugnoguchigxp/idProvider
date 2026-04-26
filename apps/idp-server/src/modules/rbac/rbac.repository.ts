import {
  and,
  type DbClient,
  type DbTransaction,
  desc,
  entitlements,
  eq,
  groupMemberships,
  groupRoles,
  groups,
  gt,
  isNull,
  or,
  permissions,
  rolePermissions,
  roles,
  sql,
  userEmails,
  userRoles,
} from "@idp/db";
import { BaseRepository } from "../../core/base-repository.js";

export class RBACRepository extends BaseRepository {
  async listPermissionKeys(
    userId: string,
    context?: { organizationId?: string; groupId?: string },
    tx?: DbTransaction | DbClient,
  ): Promise<string[]> {
    const db = tx ?? this.db;

    const directRows = await db
      .select({ key: permissions.key })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(userRoles.userId, userId));

    const hasGroupFilter = Boolean(context?.groupId || context?.organizationId);
    const groupRows = await db
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

  async findEntitlement(
    input: {
      userId: string;
      key: string;
      organizationId?: string;
      groupId?: string;
    },
    tx?: DbTransaction | DbClient,
  ) {
    const db = tx ?? this.db;
    const now = new Date();
    const isActive = and(
      eq(entitlements.enabled, true),
      or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now)),
    );

    // User scope
    const userRows = await db
      .select()
      .from(entitlements)
      .where(
        and(
          eq(entitlements.key, input.key),
          eq(entitlements.userId, input.userId),
          isActive,
        ),
      )
      .orderBy(desc(entitlements.createdAt))
      .limit(1);

    if (userRows[0]) return { ...userRows[0], scope: "user" };

    // Group scope
    const groupRows = await db
      .select()
      .from(entitlements)
      .innerJoin(groups, eq(entitlements.groupId, groups.id))
      .innerJoin(groupMemberships, eq(groups.id, groupMemberships.groupId))
      .where(
        and(
          eq(entitlements.key, input.key),
          eq(groupMemberships.userId, input.userId),
          isActive,
          input.groupId ? eq(groups.id, input.groupId) : undefined,
          input.organizationId
            ? eq(groups.organizationId, input.organizationId)
            : undefined,
        ),
      )
      .orderBy(desc(entitlements.createdAt))
      .limit(1);

    if (groupRows[0]) return { ...groupRows[0].entitlements, scope: "group" };

    if (!input.organizationId) {
      return null;
    }

    const membershipRows = await db
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
    if (membershipRows.length === 0) {
      return null;
    }

    const organizationRows = await db
      .select()
      .from(entitlements)
      .where(
        and(
          eq(entitlements.key, input.key),
          eq(entitlements.organizationId, input.organizationId),
          isActive,
        ),
      )
      .orderBy(desc(entitlements.createdAt))
      .limit(1);

    if (organizationRows[0]) {
      return { ...organizationRows[0], scope: "organization" };
    }

    return null;
  }

  async listAllActiveEntitlementKeys(
    tx?: DbTransaction | DbClient,
  ): Promise<string[]> {
    const db = tx ?? this.db;
    const now = new Date();
    const result = await db
      .select({ key: entitlements.key })
      .from(entitlements)
      .where(
        and(
          eq(entitlements.enabled, true),
          or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now)),
        ),
      );
    return [...new Set(result.map((r) => r.key))];
  }

  async listUsersWithPermissionPrefix(
    permissionPrefix: string,
    limit: number,
    tx?: DbTransaction | DbClient,
  ) {
    const db = tx ?? this.db;
    const rows = await db
      .select({
        userId: userRoles.userId,
        roleKey: roles.key,
        permissionKey: permissions.key,
        email: userEmails.email,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .innerJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .leftJoin(
        userEmails,
        and(
          eq(userEmails.userId, userRoles.userId),
          eq(userEmails.isPrimary, true),
        ),
      )
      .where(
        or(
          sql`${permissions.key} LIKE ${`${permissionPrefix}%`}`,
          eq(permissions.key, "admin:all"),
        ),
      )
      .limit(limit * 10);

    const byUser = new Map<
      string,
      {
        userId: string;
        email: string | null;
        roles: Set<string>;
        permissions: Set<string>;
      }
    >();
    for (const row of rows) {
      const existing = byUser.get(row.userId) ?? {
        userId: row.userId,
        email: row.email ?? null,
        roles: new Set<string>(),
        permissions: new Set<string>(),
      };
      existing.roles.add(row.roleKey);
      existing.permissions.add(row.permissionKey);
      if (!existing.email && row.email) {
        existing.email = row.email;
      }
      byUser.set(row.userId, existing);
    }

    return Array.from(byUser.values())
      .slice(0, limit)
      .map((row) => ({
        userId: row.userId,
        email: row.email,
        roles: Array.from(row.roles).sort(),
        permissions: Array.from(row.permissions).sort(),
      }));
  }
}
