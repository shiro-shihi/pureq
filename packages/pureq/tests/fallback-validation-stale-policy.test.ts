import { describe, expect, it, vi } from "vitest";
import { fallback } from "../src/middleware/fallback";
import { validation } from "../src/middleware/validation";
import { resolveStalePolicy } from "../src/middleware/stalePolicy";
import { HttpResponse } from "../src/response/response";
import { getPolicyTrace } from "../src/utils/policyTrace";

describe("fallback middleware", () => {
  it("returns fallback value on thrown error", async () => {
    const mw = fallback({
      value: new HttpResponse(new Response("fallback", { status: 200 })),
    });
    const req = { method: "GET" as const, url: "/unstable" };

    const res = await mw(req, async () => {
      throw new Error("boom");
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("fallback");
    expect(getPolicyTrace(req)).toHaveLength(1);
  });

  it("can fallback on non-ok response when when() returns true", async () => {
    const mw = fallback({
      when: (trigger) => trigger.type === "response" && trigger.response.status === 503,
      value: ({ type }) => new HttpResponse(new Response(`from-${type}`, { status: 200 })),
    });

    const res = await mw({ method: "GET", url: "/service" }, async () => {
      return new HttpResponse(new Response("down", { status: 503 }));
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("from-response");
  });

  it("does not fallback on non-ok response by default", async () => {
    const mw = fallback({
      value: new HttpResponse(new Response("fallback", { status: 200 })),
    });

    const res = await mw({ method: "GET", url: "/service" }, async () => {
      return new HttpResponse(new Response("bad", { status: 500 }));
    });

    expect(res.status).toBe(500);
  });

  it("rethrows error when when() returns false", async () => {
    const mw = fallback({
      when: () => false,
      value: new HttpResponse(new Response("fallback", { status: 200 })),
    });

    await expect(
      mw({ method: "GET", url: "/x" }, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
  });
});

describe("validation middleware", () => {
  it("passes when validate succeeds", async () => {
    const validate = vi.fn(async (data: unknown) => {
      expect(data).toEqual({ ok: true });
      return true;
    });
    const mw = validation({ validate });

    const res = await mw({ method: "GET", url: "/x" }, async () => {
      return new HttpResponse(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    });

    expect(res.status).toBe(200);
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it("skips validation for non-ok responses", async () => {
    const validate = vi.fn(() => true);
    const mw = validation({ validate });

    const res = await mw({ method: "GET", url: "/x" }, async () => {
      return new HttpResponse(new Response("bad", { status: 500 }));
    });

    expect(res.status).toBe(500);
    expect(validate).not.toHaveBeenCalled();
  });

  it("throws wrapped validation error with custom message factory", async () => {
    const mw = validation({
      validate: () => false,
      message: (data) => `invalid:${JSON.stringify(data)}`,
    });

    await expect(
      mw({ method: "GET", url: "/x" }, async () => {
        return new HttpResponse(
          new Response(JSON.stringify({ id: "u1" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        );
      })
    ).rejects.toMatchObject({
      message: "invalid:{\"id\":\"u1\"}",
      code: "PUREQ_VALIDATION_ERROR",
      kind: "validation-error",
    });
  });

  it("returns response in silent mode when validation fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mw = validation({
      validate: () => null,
      silent: true,
    });

    const res = await mw({ method: "GET", url: "/x" }, async () => {
      return new HttpResponse(
        new Response(JSON.stringify({ id: "u1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );
    });

    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("resolveStalePolicy", () => {
  it("marks fresh and stale-if-error within bounds", () => {
    const result = resolveStalePolicy({
      storedAt: 100,
      now: 150,
      ttlMs: 60,
      staleIfErrorMs: 20,
    });

    expect(result.ageMs).toBe(50);
    expect(result.isFresh).toBe(true);
    expect(result.canServeStaleOnError).toBe(true);
  });

  it("clamps negative age and expires stale-if-error after window", () => {
    const futureStored = resolveStalePolicy({
      storedAt: 200,
      now: 100,
      ttlMs: 10,
      staleIfErrorMs: 5,
    });
    expect(futureStored.ageMs).toBe(0);

    const expired = resolveStalePolicy({
      storedAt: 100,
      now: 130,
      ttlMs: 10,
      staleIfErrorMs: 5,
    });
    expect(expired.isFresh).toBe(false);
    expect(expired.canServeStaleOnError).toBe(false);
  });
});
