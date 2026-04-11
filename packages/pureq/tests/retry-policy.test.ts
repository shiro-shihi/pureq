import { describe, expect, it } from "vitest";
import { retry } from "../src/middleware/retry";
import { HttpResponse } from "../src/response/response";

describe("retry policy", () => {
  it("retries on 5xx by default", async () => {
    let attempts = 0;

    const mw = retry({ maxRetries: 2, delay: 1, backoff: false });

    const response = await mw(
      {
        method: "GET",
        url: "https://example.com",
      },
      async () => {
        attempts += 1;
        if (attempts < 3) {
          return new HttpResponse(new Response("err", { status: 500 }));
        }
        return new HttpResponse(new Response("ok", { status: 200 }));
      }
    );

    expect(attempts).toBe(3);
    expect(response.status).toBe(200);
  });

  it("does not retry 4xx by default", async () => {
    let attempts = 0;

    const mw = retry({ maxRetries: 3, delay: 1, backoff: false });

    const response = await mw(
      {
        method: "GET",
        url: "https://example.com",
      },
      async () => {
        attempts += 1;
        return new HttpResponse(new Response("bad", { status: 400 }));
      }
    );

    expect(attempts).toBe(1);
    expect(response.status).toBe(400);
  });

  it("retries only configured status when retryOnStatus is set", async () => {
    let attempts = 0;

    const mw = retry({ maxRetries: 3, delay: 1, backoff: false, retryOnStatus: [429] });

    const response = await mw(
      {
        method: "GET",
        url: "https://example.com",
      },
      async () => {
        attempts += 1;
        if (attempts < 2) {
          return new HttpResponse(new Response("too many", { status: 429 }));
        }
        return new HttpResponse(new Response("ok", { status: 200 }));
      }
    );

    expect(attempts).toBe(2);
    expect(response.status).toBe(200);
  });
});
