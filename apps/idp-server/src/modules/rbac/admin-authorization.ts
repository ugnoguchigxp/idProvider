import { ApiError } from "@idp/shared";
import type { AppEnv } from "../../config/env.js";
import type { AuditRepository } from "../audit/audit.repository.js";
import type { RBACService } from "./rbac.service.js";

type AdminAuthorizationDeps = {
  rbacService: RBACService;
  auditRepository: AuditRepository;
  env: AppEnv;
};

type AssertAdminPermissionInput = {
  userId: string;
  resource: string;
  action: string;
  path?: string;
  method?: string;
  message?: string;
};

const isAllowed = (value: { allowed?: boolean } | null | undefined): boolean =>
  value?.allowed === true;

export const assertAdminPermission = async (
  deps: AdminAuthorizationDeps,
  input: AssertAdminPermissionInput,
) => {
  const primary = await deps.rbacService.authorizationCheck({
    userId: input.userId,
    resource: input.resource,
    action: input.action,
  });
  if (isAllowed(primary)) {
    return;
  }

  const sodEnforced = deps.env.ADMIN_SOD_ENFORCED === true;
  if (!sodEnforced) {
    const legacy = await deps.rbacService.authorizationCheck({
      userId: input.userId,
      resource: "admin",
      action: "manage",
    });
    if (isAllowed(legacy)) {
      return;
    }
  }

  try {
    await deps.auditRepository.createSecurityEvent({
      eventType: "admin.access.denied",
      userId: input.userId,
      payload: {
        resource: input.resource,
        action: input.action,
        requiredPermission: `${input.resource}:${input.action}`,
        path: input.path ?? null,
        method: input.method ?? null,
        sodEnforced,
      },
    });
  } catch {
    // Do not mask authorization failures when audit persistence fails.
  }

  throw new ApiError(
    403,
    "forbidden",
    input.message ?? "Insufficient admin permission",
  );
};
