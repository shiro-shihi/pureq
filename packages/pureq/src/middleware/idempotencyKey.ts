import type { Middleware, RequestConfig } from "../types/http";
import { generateSecureId } from "../utils/crypto";

export interface IdempotencyKeyOptions {
  readonly methods?: readonly RequestConfig["method"][];
  readonly headerName?: string;
  readonly onlyIfBodyPresent?: boolean;
  readonly keyFactory?: () => string;
}

/**
 * Adds idempotency key headers for mutation requests when absent.
 */
export function idempotencyKey(options: IdempotencyKeyOptions = {}): Middleware {
  const methods = new Set(options.methods ?? ["POST", "PUT", "PATCH", "DELETE"]);
  const headerName = options.headerName ?? "Idempotency-Key";
  const onlyIfBodyPresent = options.onlyIfBodyPresent ?? false;
  const keyFactory = options.keyFactory ?? (() => generateSecureId("idem"));

  return async (req, next) => {
    if (!methods.has(req.method)) {
      return next(req);
    }

    if (onlyIfBodyPresent && req.body === undefined) {
      return next(req);
    }

    // Use case-insensitive header lookup to avoid double-setting
    const existingHeaderValue = req.headers &&
      Object.entries(req.headers).find(
        ([k]) => k.toLowerCase() === headerName.toLowerCase()
      )?.[1];
    if (existingHeaderValue) {
      return next(req);
    }

    const nextReq: RequestConfig = {
      ...req,
      headers: {
        ...(req.headers ?? {}),
        [headerName]: keyFactory(),
      },
    };

    return next(nextReq);
  };
}
