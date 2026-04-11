import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../src/client/createClient";
import { idempotencyKey } from "../src/middleware/idempotencyKey";

describe("idempotency key middleware", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds idempotency key header for mutation requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    const client = createClient().use(
      idempotencyKey({
        keyFactory: () => "idem-123",
      })
    );

    await client.post("https://api.example.com/orders", { itemId: "p1" });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("idem-123");
  });

  it("does not override existing idempotency key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    const client = createClient().use(
      idempotencyKey({
        keyFactory: () => "idem-generated",
      })
    );

    await client.post("/orders", { itemId: "p1" }, {
      headers: { "Idempotency-Key": "idem-existing" },
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("idem-existing");
  });
});
