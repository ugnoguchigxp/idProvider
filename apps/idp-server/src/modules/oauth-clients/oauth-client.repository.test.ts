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

  it("findActiveByClientId returns client when found", async () => {
    db.then.mockImplementation((resolve: any) =>
      resolve([{ id: "c1", clientId: "client-1", status: "active" }]),
    );

    const result = await repository.findActiveByClientId("client-1");
    expect(result?.clientId).toBe("client-1");
  });

  it("listActiveSecrets returns rows", async () => {
    db.then.mockImplementation((resolve: any) =>
      resolve([{ id: "s1", isPrimary: true }]),
    );

    const result = await repository.listActiveSecrets("c1");
    expect(result).toHaveLength(1);
  });

  it("updateClient returns null when client not found", async () => {
    db.then.mockImplementation((resolve: any) => resolve([]));

    const result = await repository.updateClient("missing", {
      actorUserId: "u1",
      name: "updated",
    });

    expect(result).toBeNull();
  });
});
