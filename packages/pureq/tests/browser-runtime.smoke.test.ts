import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../src/index";

describe("browser runtime smoke", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("executes basic request flow in browser-like environment", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const client = createClient();
    const data = await client.getJson<{ ok: boolean }>("https://example.com/health");

    expect(data.ok).toBe(true);
  });
});
