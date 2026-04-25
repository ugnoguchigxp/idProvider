import { beforeEach, describe, expect, it } from "vitest";
import { createDrizzleMock } from "../../test-utils/drizzle-mock.js";
import { IdentityRepository } from "./identity.repository.js";

describe("IdentityRepository", () => {
  let repository: IdentityRepository;
  let db: any;

  beforeEach(() => {
    db = createDrizzleMock();
    repository = new IdentityRepository(db);
  });

  it("should find by provider", async () => {
    db.then.mockImplementation((resolve: any) => resolve([{ id: "i1" }]));
    const result = await repository.findByProvider("google", "sub1");
    expect(result?.id).toBe("i1");
  });

  it("should create identity", async () => {
    await repository.create({
      userId: "u1",
      provider: "google",
      providerSubject: "sub1",
      email: "a@b.com",
    });
    expect(db.insert).toHaveBeenCalled();
  });

  it("should delete identity", async () => {
    await repository.delete("u1", "google", "sub1");
    expect(db.delete).toHaveBeenCalled();
  });
});
