import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { publicEndpointAdapter } from "./public-endpoint-adapter.js";

describe("public-endpoint-adapter", () => {
  const schema = z.object({ foo: z.string() });
  const handler = vi.fn().mockResolvedValue({ ok: true });

  it("should parse payload and call handler", async () => {
    const adapter = publicEndpointAdapter({ schema, handler });
    const c = {
      req: {
        method: "POST",
        header: () => "application/json",
        json: vi.fn().mockResolvedValue({ foo: "bar" }),
      },
      json: vi.fn().mockImplementation((val) => val),
    } as any;

    const result = await adapter(c);
    expect(handler).toHaveBeenCalledWith(c, { foo: "bar" });
    expect(result).toEqual({ ok: true });
  });

  it("should return 400 on validation error", async () => {
    const adapter = publicEndpointAdapter({ schema, handler });
    const c = {
      req: {
        method: "POST",
        header: () => "application/json",
        json: vi.fn().mockResolvedValue({ foo: 123 }),
      },
    } as any;

    await expect(adapter(c)).rejects.toThrow();
  });
});
