import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, retry } from "../src/index";
import { createMiddlewareDiagnostics } from "../src/middleware/diagnostics";

describe("retry policy trace", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces retry decisions through diagnostics events", async () => {
    let attempts = 0;
    const diagnostics = createMiddlewareDiagnostics();

    const client = createClient()
      .use(diagnostics.middleware)
      .use(
        retry({
          maxRetries: 1,
          delay: 1,
          backoff: false,
          retryOnStatus: [500],
        })
      );

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response("temporary", { status: 500 });
      }
      return new Response("ok", { status: 200 });
    });

    const response = await client.get("https://example.com/ping");
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const snapshot = diagnostics.snapshot();
    const event = snapshot.recentEvents[snapshot.recentEvents.length - 1];
    expect(event?.policyTrace?.[0]?.policy).toBe("retry");
    expect(event?.policyTrace?.[0]?.decision).toBe("retry");
  });
});
