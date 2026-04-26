import type { ApiError } from "@idp/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebAuthnService } from "../webauthn-service.js";

vi.mock("@simplewebauthn/server", () => ({
  generateAuthenticationOptions: vi
    .fn()
    .mockResolvedValue({ challenge: "challenge-1" }),
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  verifyAuthenticationResponse: vi.fn().mockResolvedValue({
    verified: true,
    authenticationInfo: { newCounter: 2 },
  }),
}));

describe("WebAuthnService", () => {
  let db: any;
  let redis: any;
  let service: WebAuthnService;

  beforeEach(() => {
    const factor = {
      id: "factor-1",
      userId: "user-1",
      type: "webauthn",
      enabled: true,
      webauthnData: {
        credentialID: "cred-1",
        credentialPublicKey: Buffer.from("pk").toString("base64url"),
        counter: 1,
      },
    };

    db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([factor]),
        })),
      })),
      transaction: vi.fn(async (handler: any) =>
        handler({
          update: vi.fn(() => ({
            set: vi.fn(() => ({
              where: vi.fn().mockResolvedValue(undefined),
            })),
          })),
        }),
      ),
    };

    redis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn().mockResolvedValue(undefined),
    };

    service = new WebAuthnService(db, redis, {
      rpName: "Test RP",
      rpID: "localhost",
      origin: "http://localhost:3000",
    });
  });

  it("rejects replay by requiring a fresh challenge after successful verify", async () => {
    redis.get.mockResolvedValueOnce("challenge-1").mockResolvedValueOnce(null);

    const responseBody = {
      id: "cred-1",
      rawId: "cred-1",
      type: "public-key",
      response: {},
      clientExtensionResults: {},
    } as any;

    await expect(
      service.verifyAuthenticationResponse("user-1", responseBody),
    ).resolves.toEqual({ success: true });

    await expect(
      service.verifyAuthenticationResponse("user-1", responseBody),
    ).rejects.toMatchObject<ApiError>({
      status: 400,
      code: "webauthn_challenge_expired",
    });

    expect(redis.del).toHaveBeenCalledTimes(1);
  });
});
