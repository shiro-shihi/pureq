import { afterEach, describe, expect, it, vi } from "vitest";
import { httpCache } from "../src/middleware/httpCache";
import { HttpResponse } from "../src/response/response";

describe("http cache middleware", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("serves fresh cached responses without calling the downstream handler again", async () => {
    const mw = httpCache({ ttlMs: 1000 });
    let calls = 0;

    const first = await mw(
      {
        method: "GET",
        url: "https://example.com/users/1",
      },
      async () => {
        calls += 1;
        return new HttpResponse(
          new Response(JSON.stringify({ id: 1 }), {
            status: 200,
            headers: {
              "content-type": "application/json",
              etag: '"v1"',
            },
          })
        );
      }
    );

    const second = await mw(
      {
        method: "GET",
        url: "https://example.com/users/1",
      },
      async () => {
        calls += 1;
        return new HttpResponse(new Response("should not run", { status: 500 }));
      }
    );

    expect(calls).toBe(1);
    expect(await first.json<{ id: number }>()).toEqual({ id: 1 });
    expect(await second.json<{ id: number }>()).toEqual({ id: 1 });
  });

  it("falls back to stale cache when the upstream request fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const mw = httpCache({ ttlMs: 1, staleIfErrorMs: 1000 });
    let calls = 0;

    await mw(
      {
        method: "GET",
        url: "https://example.com/users/1",
      },
      async () => {
        calls += 1;
        return new HttpResponse(new Response(JSON.stringify({ id: 1 }), { status: 200 }));
      }
    );

    await vi.advanceTimersByTimeAsync(5);

    const response = await mw(
      {
        method: "GET",
        url: "https://example.com/users/1",
      },
      async () => {
        calls += 1;
        throw new TypeError("network fail");
      }
    );

    expect(calls).toBe(2);
    expect(await response.json<{ id: number }>()).toEqual({ id: 1 });
  });
});
