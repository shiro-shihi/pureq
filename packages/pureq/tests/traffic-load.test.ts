import { describe, expect, it } from "vitest";
import { concurrencyLimit } from "../src/middleware/concurrencyLimit";
import { dedupe } from "../src/middleware/dedupe";
import { createCircuitBreaker, PureqCircuitOpenError } from "../src/middleware/circuitBreaker";
import { HttpResponse } from "../src/response/response";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("traffic/load: high concurrency", () => {
  it("enforces maxConcurrent under burst traffic", async () => {
    const startedAt = Date.now();
    const maxConcurrent = 8;
    const middleware = concurrencyLimit({ maxConcurrent });

    let inFlight = 0;
    let maxSeen = 0;
    const total = 240;

    const tasks = Array.from({ length: total }, (_, i) =>
      middleware(
        { method: "GET", url: `/burst/${i}` },
        async () => {
          inFlight += 1;
          maxSeen = Math.max(maxSeen, inFlight);
          await sleep(3);
          inFlight -= 1;
          return new HttpResponse(new Response("ok", { status: 200 }));
        }
      )
    );

    const responses = await Promise.all(tasks);
    const durationMs = Date.now() - startedAt;
    console.info("[pureq][traffic-metrics]", {
      scenario: "concurrency-burst",
      total,
      maxConcurrent,
      maxSeen,
      success: responses.length,
      durationMs,
      throughputRps: Number((responses.length / Math.max(durationMs / 1000, 0.001)).toFixed(2)),
    });

    expect(responses).toHaveLength(total);
    expect(responses.every((res) => res.status === 200)).toBe(true);
    expect(maxSeen).toBeLessThanOrEqual(maxConcurrent);
  });

  it("collapses same-signature request storms via dedupe", async () => {
    const startedAt = Date.now();
    const middleware = dedupe();
    let upstreamCalls = 0;

    const req = { method: "GET" as const, url: "https://example.com/hot" };
    const total = 120;

    const calls = Array.from({ length: total }, () =>
      middleware(req, async () => {
        upstreamCalls += 1;
        await sleep(5);
        return new HttpResponse(new Response("shared", { status: 200 }));
      })
    );

    const responses = await Promise.all(calls);
    const texts = await Promise.all(responses.map((r) => r.text()));
    const durationMs = Date.now() - startedAt;

    console.info("[pureq][traffic-metrics]", {
      scenario: "dedupe-storm",
      total,
      upstreamCalls,
      dedupeRate: Number((((total - upstreamCalls) / total) * 100).toFixed(2)),
      durationMs,
    });

    expect(upstreamCalls).toBe(1);
    expect(texts.every((t) => t === "shared")).toBe(true);
  });
});

describe("traffic/load: failure burst handling", () => {
  it("opens circuit quickly after repeated failures and short-circuits subsequent traffic", async () => {
    const startedAt = Date.now();
    const controller = createCircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 60_000,
      keyBuilder: () => "api:orders",
    });

    const req = { method: "GET" as const, url: "/orders" };

    for (let i = 0; i < 3; i++) {
      await expect(
        controller.middleware(req, async () => {
          throw new Error("upstream down");
        })
      ).rejects.toThrow("upstream down");
    }

    await expect(
      controller.middleware(req, async () => {
        return new HttpResponse(new Response("should-not-run", { status: 200 }));
      })
    ).rejects.toBeInstanceOf(PureqCircuitOpenError);

    const snapshot = await controller.snapshot();
    console.info("[pureq][traffic-metrics]", {
      scenario: "circuit-open-burst",
      failuresToOpen: 3,
      openCircuits: snapshot.summary.open,
      durationMs: Date.now() - startedAt,
    });
    expect(snapshot.summary.open).toBe(1);
  });
});
