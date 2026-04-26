import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyTurnstileToken } from "./turnstile.js";

describe("verifyTurnstileToken", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns ok=true when provider returns success", async () => {
    (fetch as any).mockResolvedValue({
      json: async () => ({
        success: true,
        action: "login",
        hostname: "example.com",
      }),
    });

    const result = await verifyTurnstileToken({
      verifyUrl: "https://verify.example.com",
      secretKey: "secret",
      token: "token",
      remoteIp: "127.0.0.1",
      idempotencyKey: crypto.randomUUID(),
    });

    expect(result.ok).toBe(true);
    expect(result.action).toBe("login");
    expect(result.hostname).toBe("example.com");
  });

  it("returns error codes on failed verification", async () => {
    (fetch as any).mockResolvedValue({
      json: async () => ({
        success: false,
        "error-codes": ["timeout-or-duplicate"],
      }),
    });

    const result = await verifyTurnstileToken({
      verifyUrl: "https://verify.example.com",
      secretKey: "secret",
      token: "token",
      remoteIp: null,
      idempotencyKey: crypto.randomUUID(),
    });

    expect(result.ok).toBe(false);
    expect(result.errorCodes).toEqual(["timeout-or-duplicate"]);
  });
});
