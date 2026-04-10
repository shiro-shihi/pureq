import { describe, expect, it, vi } from "vitest";
import { createInstrumentedAdapter } from "../src/adapters/instrumentedAdapter";

describe("instrumented adapter", () => {
  it("emits start and success hooks", async () => {
    const starts: string[] = [];
    const successes: number[] = [];

    const adapter = createInstrumentedAdapter(
      async () => new Response("ok", { status: 200 }),
      {
        onStart(event) {
          starts.push(event.url);
        },
        onSuccess(event) {
          successes.push(event.response.status);
        },
      }
    );

    const response = await adapter("https://api.example.com/ok", { method: "GET" });

    expect(response.status).toBe(200);
    expect(starts).toEqual(["https://api.example.com/ok"]);
    expect(successes).toEqual([200]);
  });

  it("emits error hook and rethrows", async () => {
    const errors: string[] = [];

    const adapter = createInstrumentedAdapter(
      async () => {
        throw new Error("boom");
      },
      {
        onError(event) {
          errors.push(String(event.error));
        },
      }
    );

    await expect(adapter("https://api.example.com/fail", { method: "GET" })).rejects.toThrow("boom");
    expect(errors.length).toBe(1);
  });
});
