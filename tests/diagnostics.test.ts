import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../src/client/createClient";
import { createMiddlewareDiagnostics } from "../src/middleware/diagnostics";

describe("middleware diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("collects success and failure metrics", async () => {
    const streamedEvents: number[] = [];
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockRejectedValueOnce(new TypeError("network fail"));

    const diagnostics = createMiddlewareDiagnostics({
      maxEvents: 10,
      onEvent: () => {
        streamedEvents.push(1);
      },
    });
    const client = createClient().use(diagnostics.middleware);

    const okResult = await client.getResult("https://api.example.com/ok");
    const failResult = await client.getResult("https://api.example.com/fail");

    expect(okResult.ok).toBe(true);
    expect(failResult.ok).toBe(false);

    const snapshot = diagnostics.snapshot();
    expect(snapshot.total).toBe(2);
    expect(snapshot.success).toBe(1);
    expect(snapshot.failed).toBe(1);
    expect(snapshot.recentEvents.length).toBe(2);
    expect(snapshot.p50).toBeGreaterThanOrEqual(0);
    expect(snapshot.p95).toBeGreaterThanOrEqual(0);

    const last = snapshot.recentEvents[1];
    expect(last?.errorKind).toBeDefined();
    expect(streamedEvents.length).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
