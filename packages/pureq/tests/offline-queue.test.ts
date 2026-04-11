import { describe, expect, it } from "vitest";
import { createOfflineQueue } from "../src/middleware/offlineQueue";
import { HttpResponse } from "../src/response/response";

describe("offline queue middleware", () => {
  it("queues mutation requests when offline and returns 202", async () => {
    const queue = createOfflineQueue({
      isOffline: () => true,
    });

    const response = await queue.middleware(
      {
        method: "POST",
        url: "https://example.com/events",
        body: { a: 1 },
      },
      async () => new HttpResponse(new Response("ok", { status: 200 }))
    );

    expect(response.status).toBe(202);
    expect((await queue.snapshot()).size).toBe(1);
  });

  it("flushes queued requests through a replay executor", async () => {
    const queue = createOfflineQueue({ isOffline: () => true });

    await queue.middleware(
      {
        method: "POST",
        url: "https://example.com/events",
        body: { a: 1 },
      },
      async () => new HttpResponse(new Response("ok", { status: 200 }))
    );

    const replayed: string[] = [];
    const responses = await queue.flush(async (req) => {
      replayed.push(`${req.method}:${req.url}`);
      return new HttpResponse(new Response("ok", { status: 201 }));
    });

    expect(replayed).toEqual(["POST:https://example.com/events"]);
    expect(responses.length).toBe(1);
    expect(responses[0]?.status).toBe(201);
    expect((await queue.snapshot()).size).toBe(0);
  });
});
