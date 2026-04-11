import { describe, expect, it } from "vitest";
import { redactHeaders, redactObjectFields } from "../src/observability/redaction";

describe("redaction helpers", () => {
  it("redacts sensitive headers by default", () => {
    const redacted = redactHeaders({
      Authorization: "Bearer secret",
      Accept: "application/json",
    });

    expect(redacted.Authorization).toBe("[REDACTED]");
    expect(redacted.Accept).toBe("application/json");
  });

  it("redacts sensitive object fields by default patterns", () => {
    const redacted = redactObjectFields({
      token: "abc",
      userId: "u1",
      passwordHash: "xxx",
    });

    expect(redacted.token).toBe("[REDACTED]");
    expect(redacted.userId).toBe("u1");
    expect(redacted.passwordHash).toBe("[REDACTED]");
  });
});
