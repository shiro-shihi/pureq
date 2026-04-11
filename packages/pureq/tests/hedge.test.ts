import { afterEach, describe, expect, it, vi } from "vitest";
import { hedge } from "../src/middleware/hedge";
import { HttpResponse } from "../src/response/response";

describe("hedge middleware", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("launches a hedged request after the configured delay and returns the first success", async () => {
    vi.useFakeTimers();

    let firstResolve!: (value: Response) => void;
    const firstPromise = new Promise<Response>((resolve) => {
      firstResolve = resolve;
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return firstPromise;
      }

      return new Response(JSON.stringify({ id: "fast" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const mw = hedge({ hedgeAfterMs: 25 });
    const request = mw(
      {
        method: "GET",
        url: "https://example.com/users/:id",
        params: { id: "u1" },
      },
      async (req) =>
        new HttpResponse(
          await fetch(req.url, {
            method: req.method,
            ...(req.signal !== undefined ? { signal: req.signal } : {}),
          })
        )
    );

    await vi.advanceTimersByTimeAsync(25);
    await Promise.resolve();

    firstResolve(
      new Response(JSON.stringify({ id: "slow" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const response = await request;
    expect(response.status).toBe(200);
    expect(await response.json<{ id: string }>()).toEqual({ id: "fast" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
