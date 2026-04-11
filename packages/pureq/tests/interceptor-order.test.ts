import { describe, expect, it, vi, afterEach } from "vitest";
import { createClient } from "../src/client/createClient";

describe("interceptor order", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies request interceptors by descending priority", async () => {
    const callOrder: string[] = [];

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } })
    );

    const client = createClient()
      .useRequestInterceptor(
        (req) => {
          callOrder.push("low");
          return req;
        },
        { priority: 1 }
      )
      .useRequestInterceptor(
        (req) => {
          callOrder.push("high");
          return req;
        },
        { priority: 10 }
      );

    await client.get("https://example.com");

    expect(callOrder).toEqual(["high", "low"]);
  });

  it("applies response interceptors by descending priority", async () => {
    const callOrder: string[] = [];

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    const client = createClient()
      .useResponseInterceptor(
        (res) => {
          callOrder.push("low");
          return res;
        },
        { priority: 1 }
      )
      .useResponseInterceptor(
        (res) => {
          callOrder.push("high");
          return res;
        },
        { priority: 10 }
      );

    await client.get("https://example.com");

    expect(callOrder).toEqual(["high", "low"]);
  });
});
