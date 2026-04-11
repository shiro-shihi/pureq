import { describe, expect, it } from "vitest";
import { execute } from "../src/executor/execute";
import { compose } from "../src/middleware/compose";
import { dedupe } from "../src/middleware/dedupe";
import { retry } from "../src/middleware/retry";
import { concurrencyLimit } from "../src/middleware/concurrencyLimit";
import { stableKeyValues, stableQuery } from "../src/utils/stableKey";
import { HttpResponse } from "../src/response/response";
import { INTERNAL_MIDDLEWARES } from "../src/types/internal";
import type { RequestConfig } from "../src/types/http";

function makePrng(seed = 0xdecafbad): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function pick(prng: () => number, chars: string, min: number, max: number): string {
  const len = min + Math.floor(prng() * (max - min + 1));
  let out = "";
  for (let i = 0; i < len; i++) {
    const idx = Math.floor(prng() * chars.length);
    out += chars[idx] ?? "x";
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("invariant/fuzz: URL and query construction", () => {
  it("preserves parameter/query information under randomized inputs", async () => {
    const prng = makePrng(7);
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789-_ .~";

    for (let i = 0; i < 160; i++) {
      const p1 = pick(prng, chars, 1, 8);
      const p2 = pick(prng, chars, 1, 8);
      const k1 = `k${Math.floor(prng() * 10)}`;
      const k2 = `m${Math.floor(prng() * 10)}`;
      const v1 = pick(prng, chars, 1, 6);
      const arrCount = 1 + Math.floor(prng() * 4);
      const v2 = Array.from({ length: arrCount }, () => pick(prng, chars, 1, 6));

      let capturedUrl = "";
      await execute(
        {
          method: "GET",
          url: "/f/:p1/:p2",
          params: { p1, p2 },
          query: {
            [k1]: v1,
            [k2]: v2,
          },
        },
        {
          adapter: async (url) => {
            capturedUrl = url;
            return new Response("ok", { status: 200 });
          },
        }
      );

      const parsed = new URL(capturedUrl, "http://localhost");
      const pathParts = parsed.pathname.split("/").slice(-2).map(decodeURIComponent);
      expect(pathParts).toEqual([p1, p2]);

      expect(parsed.searchParams.get(k1)).toBe(v1);
      expect(parsed.searchParams.getAll(k2).sort()).toEqual([...v2].sort());
    }
  });
});

describe("invariant/fuzz: mixed fault traffic convergence", () => {
  it("always settles randomized fault traffic without violating concurrency ceiling", async () => {
    const prng = makePrng(11);
    let inFlight = 0;
    let maxInFlight = 0;

    const executor = async (req: RequestConfig): Promise<HttpResponse> => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);

      try {
        await sleep(Math.floor(prng() * 3));

        if (req.signal?.aborted) {
          throw req.signal.reason ?? new DOMException("Aborted", "AbortError");
        }

        const r = prng();
        if (r < 0.1) {
          throw new TypeError("chaos-network");
        }
        if (r < 0.3) {
          return new HttpResponse(new Response("retry", { status: 503 }));
        }
        return new HttpResponse(new Response("ok", { status: 200 }));
      } finally {
        inFlight -= 1;
      }
    };

    const run = compose(
      [
        concurrencyLimit({ maxConcurrent: 12 }),
        dedupe(),
        retry({
          maxRetries: 1,
          delay: 0,
          backoff: false,
          retryOnStatus: [503],
          retryOnNetworkError: true,
        }),
      ],
      executor
    );

    const total = 260;
    const tasks = Array.from({ length: total }, (_, i) => {
      const ac = new AbortController();
      const shouldAbort = prng() < 0.15;
      if (shouldAbort) {
        ac.abort(new DOMException("Aborted", "AbortError"));
      }

      return run({
        method: "GET",
        url: `https://fuzz.local/r/${i % 50}`,
        signal: ac.signal,
        [INTERNAL_MIDDLEWARES]: [],
      }).then(
        () => ({ ok: true as const }),
        () => ({ ok: false as const })
      );
    });

    const settled = await Promise.all(tasks);
    const success = settled.filter((x) => x.ok).length;
    const failure = settled.length - success;

    console.info("[pureq][fuzz-metrics]", {
      scenario: "mixed-fault-convergence",
      total,
      success,
      failure,
      maxInFlight,
    });

    expect(settled).toHaveLength(total);
    expect(maxInFlight).toBeLessThanOrEqual(12);
    expect(success).toBeGreaterThan(0);
    expect(failure).toBeGreaterThan(0);
  });
});

describe("invariant/fuzz: stable key generation", () => {
  it("is insensitive to insertion order for equivalent maps", () => {
    const leftHeaders = { b: "2", a: "1", c: "3" };
    const rightHeaders = { c: "3", a: "1", b: "2" };
    expect(stableKeyValues(leftHeaders)).toBe(stableKeyValues(rightHeaders));

    const leftQuery = {
      z: [3, 1, 2],
      a: "x",
      m: true,
    } as const;
    const rightQuery = {
      m: true,
      a: "x",
      z: [3, 1, 2],
    } as const;
    expect(stableQuery(leftQuery)).toBe(stableQuery(rightQuery));
  });
});
