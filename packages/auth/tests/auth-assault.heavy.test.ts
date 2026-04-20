import { describe, expect, it, vi } from "vitest";
import type { RequestConfig } from "@pureq/pureq";
import { authRefresh } from "../src/middleware";
import { createAuthSessionManager } from "../src/session";
import { authMemoryStore } from "../src/storage";

function createMockJwt(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString("base64url");
  const signature = Buffer.from("signature").toString("base64url");
  return `${header}.${payload}.${signature}`;
}

describe("assault/heavy: concurrent refresh storms", () => {
  it("deduplicates large session refresh storms under expired-token traffic", async () => {
    const store = authMemoryStore();
    const session = createAuthSessionManager(store, {
      broadcastChannel: "pureq:test:assault:session-storm",
      instanceId: "session-storm",
    });

    const expired = createMockJwt(Math.floor(Date.now() / 1000) - 60);
    const fresh = createMockJwt(Math.floor(Date.now() / 1000) + 3600);
    await session.setTokens({ accessToken: expired, refreshToken: "refresh-assault" });

    const refresh = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        accessToken: fresh,
        refreshToken: "refresh-rotated",
      };
    });

    const burst = 200;
    const states = await Promise.all(
      Array.from({ length: burst }, () => session.refreshIfNeeded(refresh, 60_000))
    );

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(states.every((state) => state.accessToken === fresh)).toBe(true);
    expect((await session.getState()).refreshToken).toBe("refresh-rotated");

    session.dispose();
  });

  it("deduplicates middleware refresh under high 401 fan-in", async () => {
    let resolveRefresh: ((value: string) => void) | undefined;
    const refreshPromise = new Promise<string>((resolve) => {
      resolveRefresh = resolve;
    });

    const refresh = vi.fn(() => refreshPromise);
    const middleware = authRefresh({
      triggerStatus: 401,
      refresh,
    });

    const request: RequestConfig = {
      method: "GET",
      url: "https://api.example.com/protected",
      headers: {
        Authorization: "Bearer stale-token",
      },
    };

    const next = vi.fn(async (req: RequestConfig) => {
      const auth = req.headers?.Authorization;
      if (auth === "Bearer refreshed-token") {
        return new Response(null, { status: 200 });
      }
      return new Response(null, { status: 401 });
    });

    const burst = 120;
    const runs = Array.from({ length: burst }, () => middleware(request, next));

    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
    resolveRefresh?.("refreshed-token");

    const responses = await Promise.all(runs);
    expect(responses.every((response) => response.status === 200)).toBe(true);
  });

  it("fails all waiting requests consistently when refresh collapses", async () => {
    const onFailure = vi.fn();
    const middleware = authRefresh({
      triggerStatus: 401,
      refresh: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error("refresh replay detected");
      },
      onFailure,
    });

    const request: RequestConfig = {
      method: "GET",
      url: "https://api.example.com/protected",
      headers: {
        Authorization: "Bearer stale-token",
      },
    };

    const burst = 60;
    const results = await Promise.allSettled(
      Array.from({ length: burst }, () => middleware(request, async () => new Response(null, { status: 401 })))
    );

    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(onFailure).toHaveBeenCalledTimes(1);

    for (const result of results) {
      if (result.status === "rejected") {
        expect(result.reason?.code).toBe("PUREQ_AUTH_REFRESH_FAILED");
      }
    }
  });
});
