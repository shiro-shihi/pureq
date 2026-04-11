import { describe, expect, it } from "vitest";
import * as pureq from "../src/index";

describe("contract: public api", () => {
  it("exports required stable surface", () => {
    expect(typeof pureq.createClient).toBe("function");
    expect(typeof pureq.retry).toBe("function");
    expect(typeof pureq.hedge).toBe("function");
    expect(typeof pureq.httpCache).toBe("function");
    expect(typeof pureq.offlineQueue).toBe("function");
    expect(typeof pureq.createOfflineQueue).toBe("function");
    expect(typeof pureq.deadline).toBe("function");
    expect(typeof pureq.concurrencyLimit).toBe("function");
    expect(typeof pureq.validatePolicyGuardrails).toBe("function");
    expect(typeof pureq.mapTransportEventToOtelAttributes).toBe("function");
    expect(typeof pureq.redactHeaders).toBe("function");
    expect(typeof pureq.redactObjectFields).toBe("function");
    expect(typeof pureq.createClient().fetch).toBe("function");
    expect(typeof pureq.compose).toBe("function");
    expect(typeof pureq.execute).toBe("function");
    expect(typeof pureq.executeResult).toBe("function");
    expect(typeof pureq.HttpResponse).toBe("function");
    expect(typeof pureq.toPureqError).toBe("function");
  });
});
