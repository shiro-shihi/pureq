import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../src/client/createClient";

describe("beginner JSON helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getJson returns parsed data for 2xx responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "u1", name: "Alice" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const client = createClient();
    const data = await client.getJson<{ id: string; name: string }>("https://example.com/users/:id", {
      params: { id: "u1" },
    });

    expect(data).toEqual({ id: "u1", name: "Alice" });
  });

  it("getJsonResult returns http error for non-2xx responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("not found", { status: 404, statusText: "Not Found" }));

    const client = createClient();
    const result = await client.getJsonResult<{ id: string }>("https://example.com/users/:id", {
      params: { id: "u1" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("http");
      expect(result.error.status).toBe(404);
    }
  });

  it("getJsonResult returns network error on transport failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Network error"));

    const client = createClient();
    const result = await client.getJsonResult<{ id: string }>("https://example.com/users/:id", {
      params: { id: "u1" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("network");
    }
  });
});