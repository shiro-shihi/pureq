import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../src/client/createClient";
import { backendPreset, bffPreset, frontendPreset, resilientPreset } from "../src/middleware/presets";

describe("resilient preset", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("provides a composable production-ready stack", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("error", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const middlewares = resilientPreset({
      retry: { maxRetries: 1, delay: 0, backoff: false },
      circuitBreaker: { failureThreshold: 5, cooldownMs: 1000 },
    });

    let client = createClient();
    for (const mw of middlewares) {
      client = client.use(mw);
    }

    const result = await client.getResult("https://api.example.com/health");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("provides dedicated profile presets", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    const front = frontendPreset();
    const bff = bffPreset();
    const back = backendPreset();

    expect(front.length).toBeGreaterThan(0);
    expect(bff.length).toBeGreaterThan(0);
    expect(back.length).toBeGreaterThan(0);

    let client = createClient();
    for (const mw of front) {
      client = client.use(mw);
    }

    const result = await client.getResult("https://api.example.com/health");
    expect(result.ok).toBe(true);
  });
});
