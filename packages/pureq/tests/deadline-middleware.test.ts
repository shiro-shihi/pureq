import { describe, expect, it } from "vitest";
import { deadline } from "../src/middleware/deadline";
import { retry } from "../src/middleware/retry";
import { HttpResponse } from "../src/response/response";

describe("deadline middleware", () => {
  it("injects deadline metadata and effective timeout", async () => {
    const mw = deadline({ defaultTimeoutMs: 1000 });

    const res = await mw(
      {
        method: "GET",
        url: "https://example.com",
      },
      async (req) => {
        const meta = (req as { _meta?: Readonly<Record<string, unknown>> })._meta;
        expect(typeof meta?.deadlineAt).toBe("number");
        expect(req.timeout).toBeLessThanOrEqual(1000);
        return new HttpResponse(new Response("ok", { status: 200 }));
      }
    );

    expect(res.status).toBe(200);
  });

  it("fails fast when deadline is already exceeded", async () => {
    const mw = deadline({
      now: () => 1_000,
    });

    const req = {
      method: "GET" as const,
      url: "https://example.com",
      _meta: { deadlineAt: 900 },
    };

    await expect(mw(req, async () => new HttpResponse(new Response("ok", { status: 200 })))).rejects
      .toThrow("deadline exceeded");
  });

  it("aborts retry sleep when total deadline is exhausted", async () => {
    const deadlineMw = deadline({ defaultTimeoutMs: 30 });
    const retryMw = retry({ maxRetries: 10, delay: 50, backoff: false });

    const composed = (req: { method: "GET"; url: string }) =>
      deadlineMw(req, (nextReq) =>
        retryMw(nextReq, async () => new HttpResponse(new Response("temporary", { status: 500 })))
      );

    await expect(composed({ method: "GET", url: "https://example.com" })).rejects.toThrow(
      /timeout|AbortError|deadline/i
    );
  });
});
