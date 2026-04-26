import { beforeEach, describe, expect, it } from "vitest";
import { createDrizzleMock } from "../../test-utils/drizzle-mock.js";
import { OAuthClientRepository } from "./oauth-client.repository.js";

describe("OAuthClientRepository", () => {
  let repository: OAuthClientRepository;
  let db: any;

  beforeEach(() => {
    db = createDrizzleMock();
    repository = new OAuthClientRepository(db);
  });

  it("findByClientId returns client when found", async () => {
    db.then.mockImplementationOnce((resolve: any) =>
      resolve([{ id: "c1", clientId: "client-1" }]),
    );

    const result = await repository.findByClientId("client-1");
    expect(result?.clientId).toBe("client-1");
  });

  it("findByClientId returns null when not found", async () => {
    db.then.mockImplementationOnce((resolve: any) => resolve([]));

    const result = await repository.findByClientId("client-1");
    expect(result).toBeNull();
  });

  it("findActiveByClientId returns client when found", async () => {
    db.then.mockImplementationOnce((resolve: any) =>
      resolve([{ id: "c1", clientId: "client-1", status: "active" }]),
    );

    const result = await repository.findActiveByClientId("client-1");
    expect(result?.clientId).toBe("client-1");
  });

  it("listActiveSecrets returns rows", async () => {
    db.then.mockImplementationOnce((resolve: any) =>
      resolve([{ id: "s1", isPrimary: true }]),
    );

    const result = await repository.listActiveSecrets("c1");
    expect(result).toHaveLength(1);
  });

  it("listClients returns empty array if no clients", async () => {
    db.then.mockImplementationOnce((resolve: any) => resolve([]));
    const result = await repository.listClients();
    expect(result).toEqual([]);
  });

  it("listClients returns clients with scopes and redirect URIs", async () => {
    db.then
      .mockImplementationOnce((resolve: any) =>
        resolve([{ id: "c1" }, { id: "c2" }]),
      ) // clients
      .mockImplementationOnce((resolve: any) =>
        resolve([{ clientPkId: "c1", redirectUri: "http://localhost" }]),
      ) // redirectUris
      .mockImplementationOnce((resolve: any) =>
        resolve([{ clientPkId: "c1", scope: "openid" }]),
      ); // scopes

    // Vitest's Promise.all mock intercept might need specific handling, but our mock just uses `.then` sequentially or parallel.
    // If it's parallel, .mockImplementationOnce will give them out in order.
    const result = await repository.listClients();
    expect(result).toHaveLength(2);
    const first = result[0];
    const second = result[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first?.redirectUris).toEqual(["http://localhost"]);
    expect(first?.allowedScopes).toEqual(["openid"]);
    expect(second?.redirectUris).toEqual([]);
    expect(second?.allowedScopes).toEqual([]);
  });

  it("createClient inserts client, secrets, scopes, uris, and audit logs", async () => {
    db.returning.mockImplementationOnce(() => [
      { id: "c1", clientId: "client-1", status: "active" },
    ]);

    const result = await repository.createClient({
      clientId: "client-1",
      name: "Client 1",
      clientType: "confidential",
      tokenEndpointAuthMethod: "client_secret_basic",
      redirectUris: ["http://localhost"],
      allowedScopes: ["openid"],
      secretHash: "hash",
      secretHint: "hint",
      actorUserId: "u1",
    });

    expect(result.id).toBe("c1");
    expect(db.insert).toHaveBeenCalledTimes(5); // client, secret, redirect, scope, audit
  });

  it("createClient throws error if creation fails", async () => {
    db.returning.mockImplementationOnce(() => []);
    await expect(
      repository.createClient({
        clientId: "client-1",
        name: "Client 1",
        clientType: "confidential",
        tokenEndpointAuthMethod: "client_secret_basic",
        redirectUris: [],
        allowedScopes: [],
        secretHash: "hash",
        secretHint: "hint",
        actorUserId: "u1",
      }),
    ).rejects.toThrow("failed_to_create_oauth_client");
  });

  it("updateClient returns null when client not found", async () => {
    // findByClientId returning null
    db.then.mockImplementationOnce((resolve: any) => resolve([]));

    const result = await repository.updateClient("missing", {
      actorUserId: "u1",
      name: "updated",
    });

    expect(result).toBeNull();
  });

  it("updateClient updates client and its related data", async () => {
    // findByClientId returns something
    db.then.mockImplementationOnce((resolve: any) =>
      resolve([{ id: "c1", name: "old", status: "active" }]),
    );
    db.returning.mockImplementationOnce(() => [
      { id: "c1", name: "updated", status: "active" },
    ]);

    const result = await repository.updateClient("client-1", {
      actorUserId: "u1",
      name: "updated",
      redirectUris: ["http://new"],
      allowedScopes: ["profile"],
      accessTokenTtlSeconds: 3600,
      refreshTokenTtlSeconds: 7200,
    });

    expect(result?.name).toBe("updated");
    expect(db.update).toHaveBeenCalled();
    expect(db.delete).toHaveBeenCalledTimes(2); // delete uris and scopes
    expect(db.insert).toHaveBeenCalledTimes(3); // new uris, new scopes, audit log
  });

  it("updateClient throws error if update returns nothing", async () => {
    db.then.mockImplementationOnce((resolve: any) =>
      resolve([{ id: "c1", name: "old", status: "active" }]),
    );
    db.returning.mockImplementationOnce(() => []);

    await expect(
      repository.updateClient("client-1", {
        actorUserId: "u1",
        name: "updated",
      }),
    ).rejects.toThrow("failed_to_update_oauth_client");
  });

  it("rotateSecret returns null when client not found", async () => {
    db.then.mockImplementationOnce((resolve: any) => resolve([]));

    const result = await repository.rotateSecret("missing", {
      actorUserId: "u1",
      secretHash: "hash",
      secretHint: "hint",
      graceUntil: null,
    });

    expect(result).toBeNull();
  });

  it("rotateSecret updates secrets and logs audit", async () => {
    db.then.mockImplementationOnce((resolve: any) => resolve([{ id: "c1" }]));

    const result = await repository.rotateSecret("client-1", {
      actorUserId: "u1",
      secretHash: "hash",
      secretHint: "hint",
      graceUntil: new Date(),
    });

    expect(result?.id).toBe("c1");
    expect(db.update).toHaveBeenCalledTimes(2); // old secret grace, client updatedAt
    expect(db.insert).toHaveBeenCalledTimes(2); // new secret, audit log
  });
});
