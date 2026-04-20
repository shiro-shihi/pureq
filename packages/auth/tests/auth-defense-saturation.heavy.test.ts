import { describe, expect, it } from "vitest";
import type { RequestConfig } from "@pureq/pureq";
import { createAuthError } from "../src/shared";
import { decodeJwt } from "../src/jwt";
import { mapAuthErrorToHttp } from "../src/framework/recipes";
import { parseOIDCCallbackParams } from "../src/oidc";
import { createAuthCsrfProtection } from "../src/csrf";
import { createAuthRevocationRegistry, withRevocationGuard } from "../src/revocation";

function makeMockJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = Buffer.from("signature").toString("base64url");
  return `${header}.${body}.${signature}`;
}

describe("defense/heavy: saturation attack matrix", () => {
  it("contains malformed OIDC callback floods with typed failures", () => {
    const malformedCallbacks = Array.from({ length: 400 }, (_, i) => {
      if (i % 4 === 0) {
        return `?error=access_denied&error_description=denied_${i}`;
      }
      if (i % 4 === 1) {
        return `?state=expected-${i}`;
      }
      if (i % 4 === 2) {
        return `?code=code-${i}&state=unexpected-${i}`;
      }
      return "";
    });

    let callbackError = 0;
    let missingCode = 0;
    let stateMismatch = 0;

    for (let i = 0; i < malformedCallbacks.length; i += 1) {
      try {
        parseOIDCCallbackParams(malformedCallbacks[i], `expected-${i}`);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "PUREQ_OIDC_CALLBACK_ERROR") {
          callbackError += 1;
        } else if (code === "PUREQ_OIDC_MISSING_CODE") {
          missingCode += 1;
        } else if (code === "PUREQ_OIDC_STATE_MISMATCH") {
          stateMismatch += 1;
        }
      }
    }

    expect(callbackError).toBeGreaterThan(0);
    expect(missingCode).toBeGreaterThan(0);
    expect(stateMismatch).toBeGreaterThan(0);
    expect(callbackError + missingCode + stateMismatch).toBe(400);
  });

  it("resists malformed JWT decode floods without accepting garbage", async () => {
    const invalidTokens = Array.from({ length: 1000 }, (_, i) => {
      if (i % 5 === 0) {
        return "not-a-jwt";
      }
      if (i % 5 === 1) {
        return "a.b";
      }
      if (i % 5 === 2) {
        return "a..c";
      }
      if (i % 5 === 3) {
        return makeMockJwt({ exp: "oops", n: i }).replace(/\./g, "_");
      }
      return `${"x".repeat(5)}.${"$".repeat(5)}.${"y".repeat(5)}`;
    });

    let accepted = 0;
    let rejected = 0;

    for (const token of invalidTokens) {
      try {
        await decodeJwt(token);
        accepted += 1;
      } catch {
        rejected += 1;
      }
    }

    expect(accepted).toBe(0);
    expect(rejected).toBe(1000);
  });

  it("keeps auth error to HTTP mapping stable under mixed attack errors", () => {
    const samples: unknown[] = [
      createAuthError("PUREQ_AUTH_MISSING_TOKEN", "missing"),
      createAuthError("PUREQ_AUTH_UNAUTHORIZED", "unauthorized"),
      createAuthError("PUREQ_AUTH_EXPIRED", "expired"),
      createAuthError("PUREQ_AUTH_INVALID_TOKEN", "invalid"),
      createAuthError("PUREQ_AUTH_REFRESH_FAILED", "refresh failed"),
      createAuthError("PUREQ_AUTH_CSRF_INVALID", "csrf invalid"),
      createAuthError("PUREQ_AUTH_REVOKED", "revoked"),
      createAuthError("PUREQ_OIDC_TOKEN_EXCHANGE_FAILED", "oidc exchange failed"),
      new Error("generic"),
      { code: "UNKNOWN_ATTACK", message: "unknown" },
    ];

    for (let i = 0; i < 300; i += 1) {
      const mapped = mapAuthErrorToHttp(samples[i % samples.length]);
      expect([400, 401, 403, 500]).toContain(mapped.status);
    }

    expect(mapAuthErrorToHttp(createAuthError("PUREQ_AUTH_CSRF_INVALID", "x")).status).toBe(403);
    expect(mapAuthErrorToHttp(createAuthError("PUREQ_OIDC_CALLBACK_ERROR", "x")).status).toBe(400);
  });

  it("blocks revoked claims across mixed high-volume request traffic", async () => {
    const registry = createAuthRevocationRegistry();

    for (let i = 0; i < 500; i += 1) {
      registry.revokeSession(`sid-${i}`);
    }

    const guard = withRevocationGuard({
      registry,
      getClaims: async (req) => {
        const sid = req.headers?.["x-sid"];
        if (!sid) {
          return null;
        }
        return { sid };
      },
    });

    const checks = await Promise.allSettled(
      Array.from({ length: 1000 }, (_, i) => {
        const sid = i % 2 === 0 ? `sid-${i % 500}` : `sid-safe-${i}`;
        const req: RequestConfig = {
          method: "GET",
          url: "https://api.example.com/resource",
          headers: { "x-sid": sid },
        };
        return guard(req, async () => new Response(null, { status: 200 }));
      })
    );

    const blocked = checks.filter((result) => result.status === "rejected").length;
    const passed = checks.filter((result) => result.status === "fulfilled").length;

    expect(blocked).toBe(500);
    expect(passed).toBe(500);
  });

  it("holds CSRF boundary under mixed-method saturation", async () => {
    const protection = createAuthCsrfProtection({
      expectedToken: () => "csrf-expected",
      headerName: "x-csrf-token",
      queryParamName: "csrfToken",
    });

    const methods: RequestConfig["method"][] = ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"];
    const middleware = protection.middleware();

    const outcomes = await Promise.allSettled(
      Array.from({ length: 700 }, (_, i) => {
        const method = methods[i % methods.length];
        const unsafe = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
        const good = i % 3 === 0;
        const req: RequestConfig = {
          method,
          url: good
            ? "https://api.example.com/write?csrfToken=csrf-expected"
            : "https://api.example.com/write?csrfToken=csrf-wrong",
          headers: unsafe
            ? {
                "x-csrf-token": good ? "csrf-expected" : "csrf-wrong",
              }
            : undefined,
        };

        return middleware(req, async () => new Response(null, { status: 204 }));
      })
    );

    const fulfilled = outcomes.filter((result) => result.status === "fulfilled").length;
    const rejected = outcomes.filter((result) => result.status === "rejected").length;

    expect(fulfilled).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
    expect(fulfilled + rejected).toBe(700);
  });
});
