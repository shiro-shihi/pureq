import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../src/index";

describe("adapter and serializer boundaries", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses custom adapter instead of global fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("fallback", { status: 200 }));

    const calls: Array<{ url: string; method?: string }> = [];
    const adapter = async (url: string, init: RequestInit) => {
      calls.push({ url, ...(init.method !== undefined ? { method: init.method } : {}) });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const client = createClient({ adapter });
    const data = await client.getJson<{ ok: boolean }>("https://api.example.com/ping");

    expect(data.ok).toBe(true);
    expect(calls).toEqual([{ url: "https://api.example.com/ping", method: "GET" }]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps relative URL when baseURL is not provided", async () => {
    const adapter = vi.fn(async (_url: string, _init: RequestInit) => new Response("{}", { status: 200 }));
    const client = createClient({ adapter });

    await client.get("health");

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0]?.[0]).toBe("health");
  });

  it("uses custom serializer and content type for object body", async () => {
    const adapter = vi.fn(async (_url: string, init: RequestInit) => {
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const client = createClient({
      adapter,
      bodySerializer: {
        serialize(body) {
          if (typeof body === "object" && body !== null) {
            return {
              payload: `payload=${JSON.stringify(body)}`,
              contentType: "application/x-www-form-urlencoded",
            };
          }
          return { payload: body == null ? null : String(body) };
        },
      },
    });

    await client.post("https://api.example.com/form", { a: 1 });

    const init = adapter.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init).toBeDefined();
    expect(init?.body).toBe('payload={"a":1}');

    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });
});
