import { describe, expect, it } from "vitest";
import * as schema from "../schema.js";

describe("db schema", () => {
  it("exports tables", () => {
    expect(schema.users).toBeDefined();
    expect(schema.userEmails).toBeDefined();
    expect(schema.userProfiles).toBeDefined();
    expect(schema.mfaRecoveryCodes).toBeDefined();
    expect(schema.legalHolds).toBeDefined();
    expect(schema.oauthClients).toBeDefined();
    expect(schema.oauthClientSecrets).toBeDefined();
  });
});
