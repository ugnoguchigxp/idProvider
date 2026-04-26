import { ApiError } from "@idp/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertAdminPermission } from "./admin-authorization.js";

describe("assertAdminPermission", () => {
  let deps: any;

  beforeEach(() => {
    deps = {
      rbacService: {
        authorizationCheck: vi.fn(),
      },
      auditRepository: {
        createSecurityEvent: vi.fn(),
      },
      env: {
        ADMIN_SOD_ENFORCED: false,
      },
    };
  });

  it("returns if primary permission allows", async () => {
    deps.rbacService.authorizationCheck.mockResolvedValueOnce({
      allowed: true,
    });

    await expect(
      assertAdminPermission(deps, {
        userId: "u1",
        resource: "users",
        action: "read",
      }),
    ).resolves.toBeUndefined();

    expect(deps.rbacService.authorizationCheck).toHaveBeenCalledWith({
      userId: "u1",
      resource: "users",
      action: "read",
    });
  });

  it("returns if legacy permission allows when sodEnforced is false", async () => {
    deps.rbacService.authorizationCheck
      .mockResolvedValueOnce({ allowed: false }) // primary
      .mockResolvedValueOnce({ allowed: true }); // legacy

    await expect(
      assertAdminPermission(deps, {
        userId: "u1",
        resource: "users",
        action: "read",
      }),
    ).resolves.toBeUndefined();

    expect(deps.rbacService.authorizationCheck).toHaveBeenCalledTimes(2);
    expect(deps.rbacService.authorizationCheck).toHaveBeenNthCalledWith(2, {
      userId: "u1",
      resource: "admin",
      action: "manage",
    });
  });

  it("throws 403 and writes audit log if denied and sodEnforced is true", async () => {
    deps.env.ADMIN_SOD_ENFORCED = true;
    deps.rbacService.authorizationCheck.mockResolvedValue({ allowed: false });

    await expect(
      assertAdminPermission(deps, {
        userId: "u1",
        resource: "users",
        action: "read",
        path: "/api/users",
        method: "GET",
      }),
    ).rejects.toThrow(ApiError);

    expect(deps.rbacService.authorizationCheck).toHaveBeenCalledTimes(1); // Legacy is NOT checked
    expect(deps.auditRepository.createSecurityEvent).toHaveBeenCalledWith({
      eventType: "admin.access.denied",
      userId: "u1",
      payload: {
        resource: "users",
        action: "read",
        requiredPermission: "users:read",
        path: "/api/users",
        method: "GET",
        sodEnforced: true,
      },
    });
  });

  it("throws 403 and writes audit log if denied and sodEnforced is false", async () => {
    deps.rbacService.authorizationCheck.mockResolvedValue({ allowed: false });

    await expect(
      assertAdminPermission(deps, {
        userId: "u1",
        resource: "users",
        action: "read",
      }),
    ).rejects.toThrow(ApiError);

    expect(deps.rbacService.authorizationCheck).toHaveBeenCalledTimes(2); // primary and legacy
    expect(deps.auditRepository.createSecurityEvent).toHaveBeenCalled();
  });

  it("throws 403 even if audit logging fails", async () => {
    deps.rbacService.authorizationCheck.mockResolvedValue({ allowed: false });
    deps.auditRepository.createSecurityEvent.mockRejectedValue(
      new Error("db error"),
    );

    await expect(
      assertAdminPermission(deps, {
        userId: "u1",
        resource: "users",
        action: "read",
      }),
    ).rejects.toThrow(ApiError);
  });
});
