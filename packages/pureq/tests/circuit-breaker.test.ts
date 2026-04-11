import { afterEach, describe, expect, it, vi } from "vitest";
import { circuitBreaker, createCircuitBreaker } from "../src/middleware/circuitBreaker";
import { createClient } from "../src/client/createClient";
import { keyByHost, keyByMethodAndPath } from "../src/middleware/circuitBreakerKeys";

describe("circuit breaker middleware", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("opens after threshold failures and short-circuits subsequent requests", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("downstream error"));

    const client = createClient().use(
      circuitBreaker({
        failureThreshold: 2,
        cooldownMs: 1_000,
      })
    );

    const first = await client.getResult("https://api.example.com/health");
    const second = await client.getResult("https://api.example.com/health");
    const third = await client.getResult("https://api.example.com/health");

    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    expect(third.ok).toBe(false);

    if (!third.ok) {
      expect(third.error.kind).toBe("circuit-open");
    }

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("transitions to half-open after cooldown and closes on successful probe", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("temporary outage"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const client = createClient().use(
      circuitBreaker({
        failureThreshold: 1,
        successThreshold: 1,
        cooldownMs: 5_000,
      })
    );

    const first = await client.getResult("https://api.example.com/health");
    expect(first.ok).toBe(false);

    const second = await client.getResult("https://api.example.com/health");
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.kind).toBe("circuit-open");
    }

    vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z"));

    const third = await client.getResult("https://api.example.com/health");
    expect(third.ok).toBe(true);

    const fourth = await client.getResult("https://api.example.com/health");
    expect(fourth.ok).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("can trip on HTTP status without thrown error", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("bad", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const client = createClient().use(
      circuitBreaker({
        failureThreshold: 1,
      })
    );

    const first = await client.get("https://api.example.com/health");
    expect(first.status).toBe(503);

    const second = await client.getResult("https://api.example.com/health");
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.kind).toBe("circuit-open");
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("isolates circuit state per dependency key", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) => {
        if (String(url).includes("service-a")) {
          throw new TypeError("service-a down");
        }
        return new Response("ok", { status: 200 });
      });

    const breaker = createCircuitBreaker({
      failureThreshold: 1,
      keyBuilder: (req) => {
        if (req.url.includes("service-a")) {
          return "service-a";
        }
        return "service-b";
      },
    });

    const client = createClient().use(breaker.middleware);

    const a1 = await client.getResult("https://service-a/api/health");
    const a2 = await client.getResult("https://service-a/api/health");
    const b1 = await client.getResult("https://service-b/api/health");

    expect(a1.ok).toBe(false);
    expect(a2.ok).toBe(false);
    if (!a2.ok) {
      expect(a2.error.kind).toBe("circuit-open");
    }

    expect(b1.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("exposes snapshot and reset controls", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("downstream error"));

    const breaker = createCircuitBreaker({
      failureThreshold: 1,
      keyBuilder: () => "dep-a",
    });

    const client = createClient().use(breaker.middleware);
    await client.getResult("https://service-a/api/health");

    const snapshot = await breaker.snapshot();
    expect(snapshot.size).toBe(1);
    expect(snapshot.summary.open).toBe(1);
    expect(snapshot.summary.closed).toBe(0);
    expect(snapshot.summary.halfOpen).toBe(0);
    expect(snapshot.entries[0]?.key).toBe("dep-a");
    expect(snapshot.entries[0]?.state).toBe("open");

    await breaker.reset("dep-a");
    expect((await breaker.snapshot()).size).toBe(0);
  });

  it("evicts oldest circuits when maxEntries is reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("downstream error"));

    const breaker = createCircuitBreaker({
      failureThreshold: 1,
      maxEntries: 2,
      keyBuilder: (req) => req.url,
    });

    const client = createClient().use(breaker.middleware);

    await client.getResult("https://svc-a.local/health");
    await client.getResult("https://svc-b.local/health");
    await client.getResult("https://svc-c.local/health");

    const snapshot = await breaker.snapshot();
    expect(snapshot.size).toBe(2);
    const keys = snapshot.entries.map((item) => item.key);
    expect(keys).toEqual(["https://svc-b.local/health", "https://svc-c.local/health"]);
  });

  it("prunes stale circuits by TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("downstream error"));

    const breaker = createCircuitBreaker({
      failureThreshold: 1,
      entryTtlMs: 1_000,
      keyBuilder: () => "dep-a",
    });

    const client = createClient().use(breaker.middleware);
    await client.getResult("https://svc-a.local/health");
    expect((await breaker.snapshot()).size).toBe(1);

    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    expect((await breaker.snapshot()).size).toBe(0);
  });

  it("provides key preset helpers", () => {
    const req = {
      method: "GET",
      url: "https://api.example.com/v1/users?cursor=1",
    } as const;

    expect(keyByHost(req)).toBe("host:api.example.com");
    expect(keyByMethodAndPath(req)).toBe("path:GET:/v1/users");
  });

  it("emits onStateChange events", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const transitions: string[] = [];

    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("temporary outage"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const breaker = createCircuitBreaker({
      failureThreshold: 1,
      successThreshold: 1,
      cooldownMs: 1_000,
      keyBuilder: () => "dep-a",
      hooks: {
        onStateChange: (event) => {
          transitions.push(`${event.from}->${event.to}`);
        },
      },
    });

    const client = createClient().use(breaker.middleware);
    await client.getResult("https://svc-a.local/health");
    await client.getResult("https://svc-a.local/health");

    vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
    await client.getResult("https://svc-a.local/health");

    expect(transitions).toEqual(["closed->open", "open->half-open", "half-open->closed"]);
  });
});
