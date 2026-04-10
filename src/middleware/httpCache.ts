import type { Middleware, RequestConfig } from "../types/http";
import type { HttpResponse } from "../response/response";
import { resolveStalePolicy } from "./stalePolicy";
import { stableKeyValues, stableQuery } from "../utils/stableKey";
import { appendPolicyTrace } from "../utils/policyTrace";

export interface HttpCacheOptions {
  readonly ttlMs: number;
  readonly staleIfErrorMs?: number;
  readonly methods?: readonly RequestConfig["method"][];
  readonly keyBuilder?: (req: Readonly<RequestConfig>) => string;
  /** Maximum number of cached entries. Oldest entries are evicted first (LRU). */
  readonly maxEntries?: number;
}

interface CachedEntry {
  readonly response: HttpResponse;
  readonly storedAt: number;
  readonly etag?: string;
  readonly lastModified?: string;
}

// stableKeyValues and stableQuery are imported from ../utils/stableKey

function defaultKeyBuilder(req: Readonly<RequestConfig>): string {
  return [req.method, req.url, stableKeyValues(req.params), stableQuery(req.query)].join("|");
}

// appendPolicyTrace is imported from ../utils/policyTrace

/**
 * Basic HTTP cache with ETag revalidation and stale-if-error fallback.
 */
export function httpCache(options: HttpCacheOptions): Middleware {
  if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) {
    throw new Error("pureq: httpCache requires a positive ttlMs");
  }

  const methods = new Set(options.methods ?? ["GET"]);
  const cache = new Map<string, CachedEntry>();
  const staleIfErrorMs = options.staleIfErrorMs ?? 0;
  const keyBuilder = options.keyBuilder ?? defaultKeyBuilder;
  const maxEntries = options.maxEntries ?? Infinity;

  return async (req, next) => {
    if (!methods.has(req.method)) {
      return next(req);
    }

    const key = keyBuilder(req);
    const cached = cache.get(key);
    const now = Date.now();

    if (cached) {
      const policy = resolveStalePolicy({
        storedAt: cached.storedAt,
        now,
        ttlMs: options.ttlMs,
        staleIfErrorMs,
      });

      if (policy.isFresh) {
        appendPolicyTrace(req, {
          policy: "cache",
          decision: "hit",
          at: now,
          reason: "fresh cache entry",
          key,
          ageMs: policy.ageMs,
          ttlMs: options.ttlMs,
        });
        return cached.response.clone();
      }
    }

    const headers: Record<string, string> = { ...(req.headers ?? {}) };
    if (cached?.etag && !headers["If-None-Match"]) {
      headers["If-None-Match"] = cached.etag;
    }
    if (cached?.lastModified && !headers["If-Modified-Since"]) {
      headers["If-Modified-Since"] = cached.lastModified;
    }

    try {
      const response = await next({
        ...req,
        headers,
      });

      if (cached && response.status === 304) {
        appendPolicyTrace(req, {
          policy: "cache",
          decision: "revalidate",
          at: Date.now(),
          reason: "etag matched",
          key,
        });
        cache.set(key, {
          ...cached,
          storedAt: Date.now(),
        });
        return cached.response.clone();
      }

      if (response.ok) {
        const etag = response.headers.get("etag") ?? undefined;
        const lastModified = response.headers.get("last-modified") ?? undefined;

        // Evict oldest entry if cache exceeds maxEntries (LRU)
        if (cache.size >= maxEntries && !cache.has(key)) {
          const oldestKey = cache.keys().next().value as string | undefined;
          if (oldestKey !== undefined) {
            cache.delete(oldestKey);
          }
        }

        cache.set(key, {
          response: response.clone(),
          storedAt: Date.now(),
          ...(etag !== undefined ? { etag } : {}),
          ...(lastModified !== undefined ? { lastModified } : {}),
        });
        appendPolicyTrace(req, {
          policy: "cache",
          decision: "store",
          at: Date.now(),
          reason: "cached successful response",
          key,
          ttlMs: options.ttlMs,
        });
      }

      return response;
    } catch (error) {
      if (cached) {
        const policy = resolveStalePolicy({
          storedAt: cached.storedAt,
          now: Date.now(),
          ttlMs: options.ttlMs,
          staleIfErrorMs,
        });

        if (policy.canServeStaleOnError) {
          appendPolicyTrace(req, {
            policy: "cache",
            decision: "stale-if-error",
            at: Date.now(),
            reason: "upstream request failed",
            key,
            ageMs: policy.ageMs,
            ttlMs: options.ttlMs,
          });
          return cached.response.clone();
        }
      }

      throw error;
    }
  };
}
