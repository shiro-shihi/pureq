import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../src/client/createClient";
import { retry } from "../src/middleware/retry";

describe("error metadata", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes retry count and request context on transport failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("socket hang up"));

    const client = createClient({ requestIdFactory: () => "req-meta-1" }).use(
      retry({ maxRetries: 2, delay: 1, backoff: false })
    );

    const result = await client.getResult("/unstable");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(["network", "unknown"]).toContain(result.error.kind);
      expect(result.error.metadata?.requestId).toBe("req-meta-1");
      expect(result.error.metadata?.method).toBe("GET");
      expect(result.error.metadata?.url).toBe("/unstable");
      expect(result.error.metadata?.retryCount).toBe(2);
      expect(["TypeError", "Error"]).toContain(result.error.metadata?.rootCause);
    }
  });
});
