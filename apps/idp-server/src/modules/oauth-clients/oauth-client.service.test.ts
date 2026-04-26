import { ApiError } from "@idp/shared";
import { describe, expect, it, vi } from "vitest";
import { OAuthClientService } from "./oauth-client.service.js";

vi.mock("../../core/password.js", () => ({
  hashPassword: vi.fn(async (s) => `hashed_${s}`),
  verifyPassword: vi.fn(async (p, h) => `hashed_${p}` === h),
}));

describe("OAuthClientService", () => {
  const mockOAuthRepo = {
    findActiveByClientId: vi.fn(),
    listActiveSecrets: vi.fn(),
    listClients: vi.fn(),
    createClient: vi.fn(),
    updateClient: vi.fn(),
    rotateSecret: vi.fn(),
  } as any;

  const mockAuditRepo = {
    createSecurityEvent: vi.fn(),
  } as any;

  const env = {
    OAUTH_CLIENT_ID: "fallback_id",
    OAUTH_CLIENT_SECRET: "fallback_secret",
  } as any;

  const service = new OAuthClientService({
    oauthClientRepository: mockOAuthRepo,
    auditRepository: mockAuditRepo,
    env,
  });

  it("listClients returns clients", async () => {
    mockOAuthRepo.listClients.mockResolvedValueOnce([{ id: "1" }]);
    const res = await service.listClients();
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.clients).toEqual([{ id: "1" }]);
  });

  describe("authenticateClientBasic", () => {
    it("authenticates valid client", async () => {
      mockOAuthRepo.findActiveByClientId.mockResolvedValueOnce({
        id: "client_pk",
        clientId: "client_id",
        status: "active",
      });
      mockOAuthRepo.listActiveSecrets.mockResolvedValueOnce([
        { isPrimary: true, secretHash: "hashed_my_secret", graceUntil: null },
      ]);

      const authHeader = `Basic ${Buffer.from("client_id:my_secret").toString("base64")}`;
      const res = await service.authenticateClientBasic(authHeader);

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.clientPkId).toBe("client_pk");
        expect(res.value.clientId).toBe("client_id");
      }
    });

    it("falls back to env credentials", async () => {
      mockOAuthRepo.findActiveByClientId.mockResolvedValueOnce(null);

      const authHeader = `Basic ${Buffer.from("fallback_id:fallback_secret").toString("base64")}`;
      const res = await service.authenticateClientBasic(authHeader);

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.clientPkId).toBe(null);
        expect(res.value.clientId).toBe("fallback_id");
      }
    });

    it("throws 401 on invalid credentials", async () => {
      mockOAuthRepo.findActiveByClientId.mockResolvedValueOnce(null);

      const authHeader = `Basic ${Buffer.from("invalid:invalid").toString("base64")}`;
      await expect(service.authenticateClientBasic(authHeader)).rejects.toThrow(
        ApiError,
      );
    });
  });

  describe("createClient", () => {
    it("creates client and logs audit event", async () => {
      mockOAuthRepo.createClient.mockResolvedValueOnce({
        clientId: "new_client_id",
      });

      const res = await service.createClient("user_id", {
        name: "Test Client",
        clientType: "confidential",
        tokenEndpointAuthMethod: "client_secret_basic",
        redirectUris: [],
        allowedScopes: [],
      });

      expect(res.ok).toBe(true);
      expect(mockOAuthRepo.createClient).toHaveBeenCalled();
      expect(mockAuditRepo.createSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "admin.oauth_client.created" }),
      );
    });
  });

  describe("updateClient", () => {
    it("updates client and logs audit event", async () => {
      mockOAuthRepo.updateClient.mockResolvedValueOnce({
        clientId: "updated_id",
        status: "active",
      });

      const res = await service.updateClient("user_id", "client_id", {
        name: "New Name",
      });
      expect(res.ok).toBe(true);
      expect(mockAuditRepo.createSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "admin.oauth_client.updated" }),
      );
    });

    it("throws 404 if client not found", async () => {
      mockOAuthRepo.updateClient.mockResolvedValueOnce(null);
      await expect(
        service.updateClient("user_id", "client_id", {}),
      ).rejects.toThrow(ApiError);
    });
  });

  describe("rotateSecret", () => {
    it("rotates secret and logs audit event", async () => {
      mockOAuthRepo.rotateSecret.mockResolvedValueOnce(true);

      const res = await service.rotateSecret("user_id", "client_id", 7);
      expect(res.ok).toBe(true);
      expect(mockAuditRepo.createSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "admin.oauth_client.secret_rotated",
        }),
      );
    });

    it("throws 404 if client not found", async () => {
      mockOAuthRepo.rotateSecret.mockResolvedValueOnce(false);
      await expect(
        service.rotateSecret("user_id", "client_id", 7),
      ).rejects.toThrow(ApiError);
    });
  });
});
