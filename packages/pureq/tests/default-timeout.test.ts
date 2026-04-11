import { describe, expect, it } from "vitest";
import { defaultTimeout } from "../src/middleware/defaultTimeout";
import { HttpResponse } from "../src/response/response";

describe("default timeout middleware", () => {
  it("applies timeout when request has none", async () => {
    const mw = defaultTimeout(1500);

    const res = await mw(
      {
        method: "GET",
        url: "https://example.com",
      },
      async (req) => {
        expect(req.timeout).toBe(1500);
        return new HttpResponse(new Response("ok", { status: 200 }));
      }
    );

    expect(res.status).toBe(200);
  });

  it("does not override explicit timeout", async () => {
    const mw = defaultTimeout(1500);

    await mw(
      {
        method: "GET",
        url: "https://example.com",
        timeout: 700,
      },
      async (req) => {
        expect(req.timeout).toBe(700);
        return new HttpResponse(new Response("ok", { status: 200 }));
      }
    );
  });
});
