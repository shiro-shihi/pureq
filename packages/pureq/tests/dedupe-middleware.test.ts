import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../src/client/createClient";
import { dedupe } from "../src/middleware/dedupe";

describe("dedupe middleware", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deduplicates concurrent GET requests by default", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return fetchPromise;
    });

    const client = createClient().use(dedupe());

    const first = client.get("https://api.example.com/users/:id", { params: { id: "u1" } });
    const second = client.get("https://api.example.com/users/:id", { params: { id: "u1" } });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch?.(
      new Response(JSON.stringify({ id: "u1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    const [a, b] = await Promise.all([first, second]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await a.json<{ id: string }>()).toEqual({ id: "u1" });
    expect(await b.json<{ id: string }>()).toEqual({ id: "u1" });
  });

  it("does not deduplicate POST by default", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", {
        status: 200,
      })
    );

    const client = createClient().use(dedupe());

    await Promise.all([
      client.post("https://api.example.com/events", { a: 1 }),
      client.post("https://api.example.com/events", { a: 1 }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("supports custom keyBuilder", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", {
        status: 200,
      })
    );

    const client = createClient().use(
      dedupe({
        methods: ["POST"],
        keyBuilder: (req) => `${req.method}:${req.url}`,
      })
    );

    await Promise.all([
      client.post("https://api.example.com/events", { a: 1 }),
      client.post("https://api.example.com/events", { a: 2 }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
