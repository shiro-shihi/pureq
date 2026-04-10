import { describe, expect, it } from "vitest";
import { compose } from "../src/middleware/compose";
import { HttpResponse } from "../src/response/response";

describe("compose", () => {
  it("throws when next() is called multiple times", async () => {
    const fn = compose([
      async (req, next) => {
        const first = next(req);
        const second = next(req);
        await first;
        return second;
      },
      async () => {
        return Promise.resolve(new HttpResponse(new Response("{}", { status: 200 })));
      },
    ]);

    await expect(
      fn({
        method: "GET",
        url: "https://example.com/health",
        _middlewares: [],
      })
    ).rejects.toThrow("next() was called multiple times");
  });
});
