import { describe, expect, it } from "vitest";
import { mapTransportEventToOtelAttributes } from "../src/observability/otelMapping";

describe("otel mapping", () => {
  it("maps transport event fields into stable otel-like attributes", () => {
    const attributes = mapTransportEventToOtelAttributes({
      phase: "success",
      at: Date.now(),
      method: "GET",
      url: "https://example.com/health",
      status: 200,
      durationMs: 12,
      retryCount: 1,
      policyTrace: [],
    });

    expect(attributes["http.request.method"]).toBe("GET");
    expect(attributes["http.response.status_code"]).toBe(200);
    expect(attributes["pureq.retry_count"]).toBe(1);
  });
});
