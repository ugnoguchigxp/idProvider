import { afterEach, describe, expect, it, vi } from "vitest";
import { checkPermission } from "./admin-api";

describe("admin-api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("checkPermission posts resource/action and returns parsed payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        allowed: true,
        permissionKey: "admin.config:write",
        source: "rbac",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkPermission("admin.config:write");
    expect(result.allowed).toBe(true);
    expect(result.permissionKey).toBe("admin.config:write");
    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/authorization/check",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          resource: "admin.config",
          action: "write",
        }),
      }),
    );
  });
});
