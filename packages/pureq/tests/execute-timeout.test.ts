import { afterEach, describe, expect, it, vi } from "vitest";
import { execute } from "../src/executor/execute";

describe("execute timeout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("aborts request when timeout is exceeded", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_, init) => {
        return new Promise<Response>((_, reject) => {
          if (init?.signal?.aborted) {
            reject(init.signal.reason ?? new Error("aborted"));
            return;
          }
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason ?? new Error("aborted"));
          });
        });
      });

    const pending = execute({
      method: "GET",
      url: "https://example.com",
      timeout: 50,
    });

    await expect(pending).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
