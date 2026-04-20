import type { Middleware, RequestConfig } from "@pureq/pureq";
import { markPolicyMiddleware } from "@pureq/pureq";
import { generateSecureId } from "@pureq/pureq";
import type { AuthCsrfOptions, AuthCsrfProtection } from "../shared/index.js";
import { createAuthError } from "../shared/index.js";

const DEFAULT_SAFE_METHODS: readonly RequestConfig["method"][] = ["GET", "HEAD", "OPTIONS"];
const MAX_CSRF_TOKEN_LENGTH = 2048;

function getHeader(headers: RequestConfig["headers"], name: string): string | null {
  if (!headers) {
    return null;
  }

  const normalized = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === normalized) {
      return typeof value === "string" ? value : null;
    }
  }

  return null;
}

function toUrl(url: string): URL {
  try {
    return new URL(url);
  } catch {
    return new URL(url, "http://localhost");
  }
}

function getRequestToken(req: Readonly<RequestConfig>, options: Pick<AuthCsrfOptions, "headerName" | "queryParamName">): string | null {
  if (options.headerName) {
    const headerValue = getHeader(req.headers, options.headerName);
    if (headerValue) {
      return headerValue;
    }
  }

  if (options.queryParamName) {
    const parsed = toUrl(req.url);
    const queryValue = parsed.searchParams.get(options.queryParamName);
    if (queryValue) {
      return queryValue;
    }
  }

  return null;
}

/**
 * SEC-H8: HMAC-based constant-time token comparison.
 * Instead of comparing tokens directly, we HMAC both with a random key
 * and compare the digests. This defeats timing side-channels regardless of
 * JIT optimization behavior.
 */
async function hmacTokenEquals(candidate: string, expected: string, hmacKey: CryptoKey): Promise<boolean> {
  const encoder = new TextEncoder();
  const [candidateDigest, expectedDigest] = await Promise.all([
    crypto.subtle.sign("HMAC", hmacKey, encoder.encode(candidate)),
    crypto.subtle.sign("HMAC", hmacKey, encoder.encode(expected)),
  ]);

  const a = new Uint8Array(candidateDigest);
  const b = new Uint8Array(expectedDigest);

  // SEC-H8: Continuous bitwise comparison to prevent any length-leakage.
  // Note: HMAC-SHA256 digests are always 32 bytes, but we maintain rigor.
  const lenA = a.length;
  const lenB = b.length;
  let diff = lenA ^ lenB;
  const maxLen = Math.max(lenA, lenB);

  for (let i = 0; i < maxLen; i++) {
    const byteA = i < lenA ? a[i]! : 0;
    const byteB = i < lenB ? b[i]! : 0;
    diff |= byteA ^ byteB;
  }

  return diff === 0;
}

/** Create a CSRF protection handler with HMAC-based safe comparison. */
export function createAuthCsrfProtection(options: AuthCsrfOptions): AuthCsrfProtection {
  if (typeof options.expectedToken !== "function") {
    throw new Error("pureq: CSRF protection requires an expectedToken provider");
  }

  const headerName = options.headerName ?? "x-csrf-token";
  const queryParamName = options.queryParamName ?? "csrfToken";
  const safeMethods = options.safeMethods ?? DEFAULT_SAFE_METHODS;

  // Generate a per-instance HMAC key for constant-time comparison
  const hmacKeyPromise = crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const issueToken = async (): Promise<string> => {
    const token = options.tokenFactory ? await options.tokenFactory() : generateSecureId("csrf");
    if (!token.trim()) {
      throw createAuthError("PUREQ_AUTH_CSRF_INVALID_TOKEN", "pureq: CSRF token factory returned an empty token");
    }
    return token;
  };

  const verify = async (req: Readonly<RequestConfig>): Promise<boolean> => {
    if (safeMethods.includes(req.method)) {
      return true;
    }

    const expected = await options.expectedToken();
    if (!expected) {
      return false;
    }

    if (expected.length > MAX_CSRF_TOKEN_LENGTH) {
      return false;
    }

    const candidate = getRequestToken(req, { headerName, queryParamName });
    if (candidate === null || candidate.length > MAX_CSRF_TOKEN_LENGTH) {
      return false;
    }

    const hmacKey = await hmacKeyPromise;
    return hmacTokenEquals(candidate, expected, hmacKey);
  };

  const middleware = (): Middleware => {
    const policy: Middleware = async (req, next) => {
      const verified = await verify(req);
      if (!verified) {
        throw createAuthError("PUREQ_AUTH_CSRF_FAILED", "pureq: CSRF validation failed", {
          details: {
            method: req.method,
            headerName,
            queryParamName,
          },
        });
      }

      return next(req);
    };

    return markPolicyMiddleware(policy, { name: "csrfProtection", kind: "auth" });
  };

  return {
    issueToken,
    verify,
    middleware,
  };
}

/** Shorthand: create CSRF middleware directly. */
export function withCsrfProtection(options: AuthCsrfOptions): Middleware {
  return createAuthCsrfProtection(options).middleware();
}