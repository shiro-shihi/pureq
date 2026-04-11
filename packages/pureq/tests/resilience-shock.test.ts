import { describe, expect, it } from "vitest";
import { createOfflineQueue } from "../src/middleware/offlineQueue";
import { concurrencyLimit } from "../src/middleware/concurrencyLimit";
import { execute } from "../src/executor/execute";
import { HttpResponse } from "../src/response/response";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("resilience/shock: abort and queue storms", () => {
  it("remains healthy after queued abort storm", async () => {
    const startedAt = Date.now();
    const middleware = concurrencyLimit({ maxConcurrent: 1, maxQueue: 400 });

    const first = middleware({ method: "GET", url: "/gate" }, async () => {
      await sleep(25);
      return new HttpResponse(new Response("first", { status: 200 }));
    });

    const controllers = Array.from({ length: 80 }, () => new AbortController());
    const abortedTasks = controllers.map((controller, i) =>
      middleware(
        { method: "GET", url: `/queued/${i}`, signal: controller.signal },
        async () => {
          return new HttpResponse(new Response("never", { status: 200 }));
        }
      ).then(
        () => ({ ok: true as const }),
        (error) => ({ ok: false as const, error })
      )
    );

    for (const c of controllers) {
      c.abort(new DOMException("Aborted", "AbortError"));
    }

    await first;

    const settled = await Promise.all(abortedTasks);
    const rejectedCount = settled.filter((x) => x.ok === false).length;

    console.info("[pureq][shock-metrics]", {
      scenario: "abort-storm",
      aborted: controllers.length,
      rejectedCount,
      durationMs: Date.now() - startedAt,
    });

    expect(rejectedCount).toBe(80);

    const healthy = await middleware({ method: "GET", url: "/healthy" }, async () => {
      return new HttpResponse(new Response("ok", { status: 200 }));
    });
    expect(healthy.status).toBe(200);
  });

  it("flushes large offline queue with partial replay failures", async () => {
    const startedAt = Date.now();
    const queue = createOfflineQueue({
      isOffline: () => true,
      maxQueueSize: 500,
    });

    const total = 140;
    for (let i = 0; i < total; i++) {
      await queue.middleware(
        {
          method: "POST",
          url: `/events/${i}`,
          priority: i % 7,
          body: { i },
        },
        async () => new HttpResponse(new Response("live", { status: 200 }))
      );
    }

    const flushed = await queue.flush(
      async (req) => {
        const id = Number(req.url.split("/").pop());
        await sleep(1);
        if (id % 10 === 0) {
          throw new Error("replay failed");
        }
        return new HttpResponse(new Response("replayed", { status: 201 }));
      },
      { concurrency: 16 }
    );

    const snapshot = await queue.snapshot();
    console.info("[pureq][shock-metrics]", {
      scenario: "offline-flush-burst",
      queued: total,
      flushed: flushed.length,
      remaining: snapshot.size,
      replayFailureRate: Number(((snapshot.size / total) * 100).toFixed(2)),
      durationMs: Date.now() - startedAt,
    });
    expect(flushed.length).toBe(126);
    expect(snapshot.size).toBe(14);
  });
});

describe("aggressive input robustness", () => {
  it("fails fast on unresolved path placeholders instead of issuing request", async () => {
    const startedAt = Date.now();
    await expect(
      execute(
        {
          method: "GET",
          url: "https://example.com/users/:id/orders/:orderId",
          params: { id: "u1" },
        },
        {
          adapter: async () => new Response("unexpected", { status: 200 }),
        }
      )
    ).rejects.toThrow("pureq: unresolved path parameters");
    console.info("[pureq][aggressive-metrics]", {
      scenario: "unresolved-placeholder-fast-fail",
      durationMs: Date.now() - startedAt,
    });
  });

  it("handles very large query arrays without crashing", async () => {
    const startedAt = Date.now();
    const values = Array.from({ length: 1000 }, (_, i) => i);
    let capturedUrl = "";

    await execute(
      {
        method: "GET",
        url: "/search",
        query: { tag: values },
      },
      {
        adapter: async (url) => {
          capturedUrl = url;
          return new Response("ok", { status: 200 });
        },
      }
    );

    console.info("[pureq][aggressive-metrics]", {
      scenario: "large-query-array",
      queryItems: values.length,
      finalUrlLength: capturedUrl.length,
      durationMs: Date.now() - startedAt,
    });

    expect(capturedUrl.includes("search?")).toBe(true);
    expect(capturedUrl.includes("tag=999")).toBe(true);
  });
});
