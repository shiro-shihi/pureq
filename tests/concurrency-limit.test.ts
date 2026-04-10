import { describe, expect, it } from "vitest";
import { concurrencyLimit } from "../src/middleware/concurrencyLimit";
import { HttpResponse } from "../src/response/response";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("concurrency limit middleware", () => {
  it("limits global in-flight concurrency", async () => {
    const mw = concurrencyLimit({ maxConcurrent: 2 });
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    let inFlight = 0;
    let maxInFlight = 0;

    const run = (idx: number) =>
      mw(
        {
          method: "GET",
          url: `https://example.com/${idx}`,
        },
        async () => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          const gate = gates[idx];
          if (!gate) {
            throw new Error("missing test gate");
          }
          await gate.promise;
          inFlight -= 1;
          return new HttpResponse(new Response("ok", { status: 200 }));
        }
      );

    const p1 = run(0);
    const p2 = run(1);
    const p3 = run(2);

    await Promise.resolve();
    await Promise.resolve();

    expect(maxInFlight).toBe(2);

    const gate0 = gates[0];
    if (!gate0) {
      throw new Error("missing gate0");
    }
    gate0.resolve();
    await p1;

    const gate1 = gates[1];
    const gate2 = gates[2];
    if (!gate1 || !gate2) {
      throw new Error("missing gate1 or gate2");
    }
    gate1.resolve();
    gate2.resolve();

    await Promise.all([p2, p3]);
    expect(maxInFlight).toBe(2);
  });

  it("supports key-based buckets", async () => {
    const mw = concurrencyLimit({
      maxConcurrent: 1,
      keyBuilder: (req) => req.url.split("/").pop() ?? "unknown",
    });

    const gateA = deferred<void>();
    const gateB = deferred<void>();
    let activeA = 0;
    let activeB = 0;
    let overlapObserved = false;

    const first = mw(
      { method: "GET", url: "https://example.com/resource/a" },
      async () => {
        activeA += 1;
        overlapObserved = overlapObserved || (activeA > 0 && activeB > 0);
        await gateA.promise;
        activeA -= 1;
        return new HttpResponse(new Response("ok", { status: 200 }));
      }
    );

    const second = mw(
      { method: "GET", url: "https://example.com/resource/b" },
      async () => {
        activeB += 1;
        overlapObserved = overlapObserved || (activeA > 0 && activeB > 0);
        await gateB.promise;
        activeB -= 1;
        return new HttpResponse(new Response("ok", { status: 200 }));
      }
    );

    await Promise.resolve();
    await Promise.resolve();

    gateA.resolve();
    gateB.resolve();
    await Promise.all([first, second]);

    expect(overlapObserved).toBe(true);
  });
});
