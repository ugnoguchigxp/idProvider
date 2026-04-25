import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./api-client";

describe("ApiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("includes credentials and returns parsed JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new ApiClient({ baseUrl: "http://localhost:3000" });
    const response = await client.request<{ status: string }>(
      "/v1/admin/configs",
    );

    expect(response.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/v1/admin/configs",
      expect.objectContaining({
        credentials: "include",
      }),
    );
  });

  it("throws API message on non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: "forbidden" }),
      }),
    );

    const client = new ApiClient();
    await expect(client.request("/v1/admin/configs")).rejects.toThrow(
      "forbidden",
    );
  });

  it("adds csrf header for unsafe methods when csrf cookie exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("document", {
      cookie: "idp_csrf_token=csrf_abc123",
    });

    const client = new ApiClient();
    await client.request("/v1/admin/configs/social-login/google", {
      method: "PUT",
      body: JSON.stringify({
        providerEnabled: true,
        clientId: "cid",
        clientSecret: "secret",
      }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/admin/configs/social-login/google",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-csrf-token": "csrf_abc123",
        }),
      }),
    );
  });
});
