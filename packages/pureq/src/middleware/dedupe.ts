import type { Middleware, QueryParams, RequestConfig } from "../types/http";
import type { HttpResponse } from "../response/response";
import { stableKeyValues, stableQuery } from "../utils/stableKey";

export interface DedupeOptions {
  readonly methods?: readonly RequestConfig["method"][];
  readonly includeHeaders?: boolean;
  readonly includeBody?: boolean;
  readonly keyBuilder?: (req: Readonly<RequestConfig>) => string;
}

// stableKeyValues and stableQuery are imported from ../utils/stableKey

function defaultKeyBuilder(req: Readonly<RequestConfig>, includeHeaders: boolean, includeBody: boolean): string {
  const headersPart = includeHeaders ? stableKeyValues(req.headers) : "";
  const bodyPart = includeBody ? JSON.stringify(req.body ?? null) : "";

  return [
    req.method,
    req.url,
    stableKeyValues(req.params),
    stableQuery(req.query),
    headersPart,
    bodyPart,
  ].join("|");
}

/**
 * Deduplicates in-flight requests with the same request signature.
 * Useful for UI bursts and concurrent cache stampede prevention.
 */
export function dedupe(options: DedupeOptions = {}): Middleware {
  const methods = new Set(options.methods ?? ["GET", "HEAD"]);
  const inflight = new Map<string, Promise<HttpResponse>>();

  return async (req, next) => {
    if (!methods.has(req.method)) {
      return next(req);
    }

    let key: string;
    try {
      key =
        options.keyBuilder?.(req) ??
        defaultKeyBuilder(req, options.includeHeaders ?? false, options.includeBody ?? false);
    } catch {
      // If signature generation fails (e.g., circular body),
      // safely bypass dedupe and execute request normally.
      return next(req);
    }

    const existing = inflight.get(key);
    if (existing) {
      const sharedResponse = await existing;
      return sharedResponse.clone();
    }

    const pending = (async () => {
      try {
        return await next(req);
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, pending);

    const response = await pending;
    return response.clone();
  };
}
