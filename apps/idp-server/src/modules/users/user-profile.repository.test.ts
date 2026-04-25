import { beforeEach, describe, expect, it } from "vitest";
import { createDrizzleMock } from "../../test-utils/drizzle-mock.js";
import { UserProfileRepository } from "./user-profile.repository.js";

describe("UserProfileRepository", () => {
  let repository: UserProfileRepository;
  let db: any;

  beforeEach(() => {
    db = createDrizzleMock();
    repository = new UserProfileRepository(db);
  });

  it("findByUserId returns profile when found", async () => {
    db.then.mockImplementation((resolve: any) =>
      resolve([{ displayName: "Taro" }]),
    );

    const result = await repository.findByUserId("u1");
    expect(result?.displayName).toBe("Taro");
  });

  it("isPreferredUsernameTaken returns true when row exists", async () => {
    db.then.mockImplementation((resolve: any) => resolve([{ userId: "u2" }]));

    const result = await repository.isPreferredUsernameTaken("taro", "u1");
    expect(result).toBe(true);
  });

  it("upsert updates existing row before inserting", async () => {
    db.returning
      .mockResolvedValueOnce([{ userId: "u1" }])
      .mockResolvedValueOnce([]);

    await repository.upsert("u1", { displayName: "Taro" });
    expect(db.update).toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("upsert inserts when row does not exist", async () => {
    db.returning.mockResolvedValueOnce([]);

    await repository.upsert("u1", { displayName: "Taro" });
    expect(db.insert).toHaveBeenCalled();
  });

  it("upsert retries update on unique violation during insert", async () => {
    db.returning
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ userId: "u1" }]);
    db.values.mockRejectedValueOnce({ code: "23505" });

    await repository.upsert("u1", { displayName: "Taro" });
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it("upsert rethrows non-unique insert errors", async () => {
    db.returning.mockResolvedValueOnce([]);
    db.values.mockRejectedValueOnce(new Error("boom"));

    await expect(
      repository.upsert("u1", { displayName: "Taro" }),
    ).rejects.toThrow("boom");
  });
});
