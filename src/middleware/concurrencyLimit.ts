import type { Middleware, RequestConfig } from "../types/http";
import { markPolicyMiddleware } from "../policy/guardrails";

export interface ConcurrencyLimitOptions {
  readonly maxConcurrent: number;
  readonly keyBuilder?: (req: Readonly<RequestConfig>) => string;
  readonly maxQueue?: number;
}

interface QueueEntry {
  readonly id: number;
  readonly resolve: () => void;
  readonly reject: (reason: unknown) => void;
  readonly signal?: AbortSignal;
  readonly onAbort?: () => void;
}

interface Bucket {
  active: number;
  queue: QueueEntry[];
}

const GLOBAL_KEY = "__global__";

function validateOptions(options: ConcurrencyLimitOptions): void {
  if (!Number.isInteger(options.maxConcurrent) || options.maxConcurrent <= 0) {
    throw new Error("pureq: concurrencyLimit requires maxConcurrent to be a positive integer");
  }

  if (options.maxQueue !== undefined && (!Number.isInteger(options.maxQueue) || options.maxQueue < 0)) {
    throw new Error("pureq: concurrencyLimit maxQueue must be >= 0");
  }
}

/**
 * Limits in-flight request concurrency globally or by key.
 */
export function concurrencyLimit(options: ConcurrencyLimitOptions): Middleware {
  validateOptions(options);

  const maxConcurrent = options.maxConcurrent;
  const maxQueue = options.maxQueue;
  const keyBuilder = options.keyBuilder ?? (() => GLOBAL_KEY);

  const buckets = new Map<string, Bucket>();
  let nextTicketId = 0;

  const getBucket = (key: string): Bucket => {
    const existing = buckets.get(key);
    if (existing) {
      return existing;
    }

    const created: Bucket = { active: 0, queue: [] };
    buckets.set(key, created);
    return created;
  };

  const cleanupBucketIfEmpty = (key: string): void => {
    const bucket = buckets.get(key);
    if (!bucket) {
      return;
    }

    if (bucket.active === 0 && bucket.queue.length === 0) {
      buckets.delete(key);
    }
  };

  const promoteNext = (key: string): void => {
    const bucket = buckets.get(key);
    if (!bucket) {
      return;
    }

    while (bucket.active < maxConcurrent && bucket.queue.length > 0) {
      const next = bucket.queue.shift();
      if (!next) {
        break;
      }

      if (next.signal && next.onAbort) {
        next.signal.removeEventListener("abort", next.onAbort);
      }

      bucket.active += 1;
      next.resolve();
    }

    cleanupBucketIfEmpty(key);
  };

  const acquire = async (key: string, signal?: AbortSignal): Promise<void> => {
    const bucket = getBucket(key);

    if (bucket.active < maxConcurrent) {
      bucket.active += 1;
      return;
    }

    if (maxQueue !== undefined && bucket.queue.length >= maxQueue) {
      throw new Error(`pureq: concurrency queue limit exceeded for key '${key}'`);
    }

    if (signal?.aborted) {
      throw signal.reason ?? new DOMException("Aborted", "AbortError");
    }

    await new Promise<void>((resolve, reject) => {
      const ticketId = nextTicketId++;
      // Prevent ticket ID overflow for long-running processes
      if (nextTicketId > Number.MAX_SAFE_INTEGER) {
        nextTicketId = 0;
      }

      let onAbort: (() => void) | undefined;
      if (signal) {
        onAbort = () => {
          const queuedBucket = buckets.get(key);
          if (!queuedBucket) {
            reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
            return;
          }

          const index = queuedBucket.queue.findIndex((entry) => entry.id === ticketId);
          if (index >= 0) {
            queuedBucket.queue.splice(index, 1);
          }

          cleanupBucketIfEmpty(key);
          reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        };

        signal.addEventListener("abort", onAbort, { once: true });
      }

      const entry: QueueEntry = {
        id: ticketId,
        resolve,
        reject,
        ...(signal !== undefined ? { signal } : {}),
        ...(onAbort !== undefined ? { onAbort } : {}),
      };

      bucket.queue.push(entry);
    });
  };

  const release = (key: string): void => {
    const bucket = buckets.get(key);
    if (!bucket) {
      return;
    }

    bucket.active = Math.max(0, bucket.active - 1);
    promoteNext(key);
  };

  const middleware: Middleware = async (req, next) => {
    const key = keyBuilder(req);
    await acquire(key, req.signal);

    try {
      return await next(req);
    } finally {
      release(key);
    }
  };

  return markPolicyMiddleware(middleware, {
    name: "concurrencyLimit",
    kind: "concurrency",
    maxConcurrent,
  });
}
