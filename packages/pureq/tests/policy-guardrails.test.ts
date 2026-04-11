import { describe, expect, it } from "vitest";
import { createClient, deadline, defaultTimeout, retry } from "../src/index";

describe("policy guardrails", () => {
  it("rejects conflicting timeout policies at client creation time", () => {
    expect(() =>
      createClient({
        middlewares: [defaultTimeout(1000), deadline({ defaultTimeoutMs: 1000 })],
      })
    ).toThrow("use deadline or defaultTimeout, not both");
  });

  it("rejects retry policies that exceed the configured max retry limit", () => {
    expect(() =>
      createClient().use(
        retry({
          maxRetries: 11,
          delay: 0,
          backoff: false,
        })
      )
    ).toThrow("retry maxRetries must be 10 or less");
  });

  it("allows a normal policy stack", () => {
    const client = createClient().use(
      retry({
        maxRetries: 2,
        delay: 0,
        backoff: false,
      })
    );

    expect(typeof client.get).toBe("function");
  });
});
