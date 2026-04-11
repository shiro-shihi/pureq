import { describe, expect, it, vi } from "vitest";
import { authRefresh } from "../src/middleware/authRefresh";
import { HttpResponse } from "../src/response/response";

describe("authRefresh middleware", () => {
  it("refreshes token and retries once on 401", async () => {
    const refresh = vi.fn(async () => "token-2");
    const middleware = authRefresh({ refresh });

    const seenAuth: string[] = [];
    const req = {
      method: "GET" as const,
      url: "/profile",
      headers: { Authorization: "Bearer token-1" },
    };

    const res = await middleware(req, async (nextReq) => {
      seenAuth.push((nextReq.headers?.Authorization as string) ?? "");
      if (seenAuth.length === 1) {
        return new HttpResponse(new Response("unauthorized", { status: 401 }));
      }
      return new HttpResponse(new Response("ok", { status: 200 }));
    });

    expect(res.status).toBe(200);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(seenAuth).toEqual(["Bearer token-1", "Bearer token-2"]);
  });

  it("shares a single refresh call across concurrent 401s", async () => {
    let refreshCount = 0;
    const middleware = authRefresh({
      refresh: async () => {
        refreshCount += 1;
        return "shared-token";
      },
    });

    const reqA = { method: "GET" as const, url: "/a" };
    const reqB = { method: "GET" as const, url: "/b" };

    const next = async (req: { headers?: Record<string, string> }) => {
      if (req.headers?.Authorization === "Bearer shared-token") {
        return new HttpResponse(new Response("ok", { status: 200 }));
      }
      return new HttpResponse(new Response("unauthorized", { status: 401 }));
    };

    const [resA, resB] = await Promise.all([
      middleware(reqA, next),
      middleware(reqB, next),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(refreshCount).toBe(1);
  });

  it("throws wrapped error when refresh fails", async () => {
    const rootError = new Error("refresh down");
    const middleware = authRefresh({
      refresh: async () => {
        throw rootError;
      },
    });

    await expect(
      middleware({ method: "GET", url: "/x" }, async () => {
        return new HttpResponse(new Response("unauthorized", { status: 401 }));
      })
    ).rejects.toMatchObject({
      message: "pureq: token refresh failed",
      code: "PUREQ_AUTH_REFRESH_FAILED",
      kind: "auth-error",
      cause: rootError,
    });
  });

  it("does not refresh when maxAttempts is zero", async () => {
    const refresh = vi.fn(async () => "unused");
    const middleware = authRefresh({ refresh, maxAttempts: 0 });

    const res = await middleware({ method: "GET", url: "/x" }, async () => {
      return new HttpResponse(new Response("unauthorized", { status: 401 }));
    });

    expect(res.status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });
});
