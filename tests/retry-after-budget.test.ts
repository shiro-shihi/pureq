import { afterEach, describe, expect, it, vi } from "vitest";
import { retry } from "../src/middleware/retry";
import { HttpResponse } from "../src/response/response";

describe("retry rate limit awareness", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("honors Retry-After when it is longer than the base delay", async () => {
    vi.useFakeTimers();

    let attempts = 0;
    const retryEvents: Array<{ waitTime: number; retryAfterMs?: number; source: string }> = [];
    const mw = retry({
      maxRetries: 1,
      delay: 10,
      backoff: false,
      retryOnStatus: [429],
      respectRetryAfter: true,
      onRetry: (event) => {
        retryEvents.push({
          waitTime: event.waitTime,
          ...(event.retryAfterMs !== undefined ? { retryAfterMs: event.retryAfterMs } : {}),
          source: event.source,
        });
      },
    });

    const promise = mw(
      {
        method: "GET",
        url: "https://example.com",
      },
      async () => {
        attempts += 1;
        if (attempts === 1) {
          return new HttpResponse(
            new Response("rate limited", {
              status: 429,
              headers: { "Retry-After": "1" },
            })
          );
        }

        return new HttpResponse(new Response("ok", { status: 200 }));
      }
    );

    await vi.advanceTimersByTimeAsync(1000);
    const response = await promise;

    expect(attempts).toBe(2);
    expect(response.status).toBe(200);
    expect(retryEvents).toEqual([
      { waitTime: 1000, retryAfterMs: 1000, source: "status" },
    ]);
  });

  it("stops retrying when retry budget would be exceeded", async () => {
    let attempts = 0;
    const retryEvents: number[] = [];
    const mw = retry({
      maxRetries: 3,
      delay: 50,
      backoff: false,
      retryBudgetMs: 10,
      onRetry: (event) => {
        retryEvents.push(event.waitTime);
      },
    });

    const response = await mw(
      {
        method: "GET",
        url: "https://example.com",
      },
      async () => {
        attempts += 1;
        return new HttpResponse(new Response("temporary", { status: 500 }));
      }
    );

    expect(attempts).toBe(1);
    expect(response.status).toBe(500);
    expect(retryEvents).toEqual([]);
  });
});
