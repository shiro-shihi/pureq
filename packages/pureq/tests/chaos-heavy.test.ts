import { afterEach, describe, expect, it, vi } from "vitest";
import { createCircuitBreaker, PureqCircuitOpenError } from "../src/middleware/circuitBreaker";
import { concurrencyLimit } from "../src/middleware/concurrencyLimit";
import { dedupe } from "../src/middleware/dedupe";
import { retry } from "../src/middleware/retry";
import { compose } from "../src/middleware/compose";
import { execute } from "../src/executor/execute";
import { HttpResponse } from "../src/response/response";
import type { RequestConfig } from "../src/types/http";
import { INTERNAL_MIDDLEWARES } from "../src/types/internal";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makePrng(seed = 0x12345678): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("chaos/heavy: half-open stampede", () => {
  it("allows only one half-open probe under concurrent burst", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const breaker = createCircuitBreaker({
      failureThreshold: 1,
      successThreshold: 1,
      cooldownMs: 1_000,
      keyBuilder: () => "dep:critical",
    });

    const req = { method: "GET" as const, url: "/critical" };

    await expect(
      breaker.middleware(req, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    vi.setSystemTime(new Date("2026-01-01T00:00:01.100Z"));

    let nextCalls = 0;
    let releaseProbe: (() => void) | undefined;

    const probePromise = breaker.middleware(req, async () => {
      nextCalls += 1;
      await new Promise<void>((resolve) => {
        releaseProbe = resolve;
      });
      return new HttpResponse(new Response("ok", { status: 200 }));
    });

    const followers = await Promise.allSettled(
      Array.from({ length: 40 }, () =>
        breaker.middleware(req, async () => {
          nextCalls += 1;
          return new HttpResponse(new Response("unexpected", { status: 200 }));
        })
      )
    );

    const openErrors = followers.filter(
      (entry) =>
        entry.status === "rejected" &&
        entry.reason instanceof PureqCircuitOpenError
    ).length;

    releaseProbe?.();
    const probe = await probePromise;

    expect(probe.status).toBe(200);
    expect(nextCalls).toBe(1);
    expect(openErrors).toBe(40);

    vi.useRealTimers();
  });
});

describe("chaos/heavy: mixed failure traffic", () => {
  it("settles large mixed traffic without deadlock and respects concurrency ceiling", async () => {
    const prng = makePrng(42);
    let inFlight = 0;
    let maxInFlight = 0;

    const base = async (_req: RequestConfig): Promise<HttpResponse> => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);

      try {
        await sleep(Math.floor(prng() * 4));
        const r = prng();
        if (r < 0.12) {
          throw new TypeError("network chaos");
        }
        if (r < 0.32) {
          return new HttpResponse(new Response("temporary", { status: 503 }));
        }
        return new HttpResponse(new Response("ok", { status: 200 }));
      } finally {
        inFlight -= 1;
      }
    };

    const pipeline = compose(
      [
        concurrencyLimit({ maxConcurrent: 20 }),
        dedupe(),
        retry({
          maxRetries: 2,
          delay: 0,
          backoff: false,
          retryOnStatus: [503],
          retryOnNetworkError: true,
        }),
      ],
      base
    );

    const total = 320;
    const tasks = Array.from({ length: total }, (_, i) =>
      pipeline({
        method: "GET",
        url: `https://example.com/hot/${i % 80}`,
        [INTERNAL_MIDDLEWARES]: [],
      }).then(
        () => ({ ok: true as const }),
        () => ({ ok: false as const })
      )
    );

    const startedAt = Date.now();
    const settled = await Promise.all(tasks);
    const durationMs = Date.now() - startedAt;
    const success = settled.filter((x) => x.ok).length;
    const failure = settled.length - success;

    console.info("[pureq][chaos-metrics]", {
      scenario: "mixed-failure-traffic",
      total,
      success,
      failure,
      maxInFlight,
      durationMs,
      throughputRps: Number((total / Math.max(durationMs / 1000, 0.001)).toFixed(2)),
    });

    expect(settled).toHaveLength(total);
    expect(maxInFlight).toBeLessThanOrEqual(20);
    expect(success).toBeGreaterThan(0);
    expect(failure).toBeGreaterThan(0);
  });
});

describe("chaos/heavy: hostile input", () => {
  it("handles hostile query keys without prototype pollution", async () => {
    const query = Object.create(null) as Record<string, string>;
    query["__proto__"] = "x";
    query["constructor"] = "y";
    query["prototype"] = "z";
    query["normal"] = "ok";

    let capturedUrl = "";
    await execute(
      {
        method: "GET",
        url: "/hostile",
        query,
      },
      {
        adapter: async (url) => {
          capturedUrl = url;
          return new Response("ok", { status: 200 });
        },
      }
    );

    expect(capturedUrl.includes("__proto__=x")).toBe(true);
    expect(capturedUrl.includes("constructor=y")).toBe(true);
    expect(capturedUrl.includes("prototype=z")).toBe(true);
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it("bypasses dedupe safely for circular request body", async () => {
    const middleware = dedupe({ includeBody: true, methods: ["POST"] });
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;

    let upstreamCalls = 0;
    const send = () =>
      middleware(
        {
          method: "POST",
          url: "/circular",
          body: circular,
        },
        async () => {
          upstreamCalls += 1;
          return new HttpResponse(new Response("ok", { status: 200 }));
        }
      );

    const [r1, r2] = await Promise.all([send(), send()]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(upstreamCalls).toBe(2);
  });
});
