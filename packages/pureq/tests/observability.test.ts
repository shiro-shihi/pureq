import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../src/client/createClient";

describe("observability hooks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits start and success events and propagates request/trace headers", async () => {
    const starts: Array<{ requestId: string; url: string }> = [];
    const successes: Array<{ requestId: string; status: number; retryCount: number }> = [];

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const client = createClient({
      baseURL: "https://api.example.com",
      requestIdFactory: () => "req-123",
      traceContextProvider: () => ({
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00",
      }),
      hooks: {
        onRequestStart: (event) => {
          starts.push({ requestId: event.requestId, url: event.url });
        },
        onRequestSuccess: (event) => {
          successes.push({
            requestId: event.requestId,
            status: event.status,
            retryCount: event.retryCount,
          });
        },
      },
    });

    await client.get("/health");

    expect(starts).toEqual([{ requestId: "req-123", url: "https://api.example.com/health" }]);
    expect(successes).toEqual([{ requestId: "req-123", status: 200, retryCount: 0 }]);

    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const init = firstCall?.[1];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["x-request-id"]).toBe("req-123");
    expect(headers.traceparent).toBe(
      "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00"
    );
  });

  it("emits error event with enriched metadata", async () => {
    const errors: string[] = [];

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Network failed"));

    const client = createClient({
      requestIdFactory: () => "req-err-1",
      hooks: {
        onRequestError: (event) => {
          errors.push(event.error.metadata?.requestId ?? "");
        },
      },
    });

    const result = await client.getResult("/users");

    expect(result.ok).toBe(false);
    expect(errors).toEqual(["req-err-1"]);
  });
});
