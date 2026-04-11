import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, retry } from "../src/index";

describe("stress: retry loop", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles repeated request cycles without state leakage", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    const client = createClient().use(
      retry({
        maxRetries: 1,
        delay: 0,
        backoff: false,
      })
    );

    const iterations = 200;
    for (let i = 0; i < iterations; i++) {
      const result = await client.getResult("https://example.com/ping");
      expect(result.ok).toBe(true);
    }
  });
});
