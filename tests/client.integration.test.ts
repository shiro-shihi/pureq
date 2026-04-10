import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient, retry } from "../src/index";

describe("integration: client flow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("composes retry + hooks + json helper in a single request flow", async () => {
    let calls = 0;
    const retryEvents: number[] = [];
    const successRetryCounts: number[] = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("temporary", { status: 500 });
      }
      return new Response(JSON.stringify({ id: "u1", name: "Alice" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const client = createClient({
      hooks: {
        onRequestSuccess: (event) => {
          successRetryCounts.push(event.retryCount);
        },
      },
    }).use(
      retry({
        maxRetries: 2,
        delay: 1,
        backoff: false,
        onRetry: (event) => {
          retryEvents.push(event.attempt);
        },
      })
    );

    const user = await client.getJson<{ id: string; name: string }>("https://example.com/users/:id", {
      params: { id: "u1" },
    });

    expect(user).toEqual({ id: "u1", name: "Alice" });
    expect(calls).toBe(2);
    expect(retryEvents).toEqual([1]);
    expect(successRetryCounts).toEqual([1]);
  });

  it("supports fetch-like usage for beginners", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({ id: "u1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const client = createClient();

    const response = await client.fetch("https://example.com/users/:id", {
      params: { id: "u1" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(await response.json<{ id: string }>()).toEqual({ id: "u1" });

    const result = await client.fetchJson<{ id: string }>("https://example.com/users/:id", {
      params: { id: "u1" },
    });

    expect(result).toEqual({ id: "u1" });
  });
});
