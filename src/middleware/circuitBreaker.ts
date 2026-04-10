import type { Middleware, RequestConfig } from "../types/http";
import type { HttpResponse } from "../response/response";

export class PureqCircuitOpenError extends Error {
  readonly code = "PUREQ_CIRCUIT_OPEN";

  constructor(message = "pureq: circuit breaker is open") {
    super(message);
    this.name = "PureqCircuitOpenError";
  }
}

export interface CircuitBreakerHooks {
  readonly onOpen?: (event: {
    readonly key: string;
    readonly openedAt: number;
    readonly failures: number;
  }) => void;
  readonly onHalfOpen?: (event: {
    readonly key: string;
    readonly at: number;
  }) => void;
  readonly onClose?: (event: {
    readonly key: string;
    readonly at: number;
  }) => void;
  readonly onStateChange?: (event: {
    readonly key: string;
    readonly from: State;
    readonly to: State;
    readonly at: number;
  }) => void;
}

export interface CircuitBreakerOptions {
  readonly failureThreshold?: number;
  readonly successThreshold?: number;
  readonly cooldownMs?: number;
  readonly keyBuilder?: (req: Readonly<RequestConfig>) => string;
  readonly maxEntries?: number;
  readonly entryTtlMs?: number;
  readonly shouldTrip?: (context: {
    readonly key: string;
    readonly req: Readonly<RequestConfig>;
    readonly response?: HttpResponse;
    readonly error?: unknown;
  }) => boolean;
  readonly hooks?: CircuitBreakerHooks;
}

type State = "closed" | "open" | "half-open";

interface CircuitEntry {
  state: State;
  failureCount: number;
  successCount: number;
  openedAt: number;
  halfOpenProbeInFlight: boolean;
  lastChangedAt: number;
  lastAccessedAt: number;
}

export interface CircuitSnapshotEntry {
  readonly key: string;
  readonly state: State;
  readonly failureCount: number;
  readonly successCount: number;
  readonly openedAt: number;
  readonly lastChangedAt: number;
  readonly lastAccessedAt: number;
}

export interface CircuitSnapshot {
  readonly size: number;
  readonly summary: {
    readonly closed: number;
    readonly open: number;
    readonly halfOpen: number;
  };
  readonly entries: readonly CircuitSnapshotEntry[];
}

export interface CircuitBreakerController {
  readonly middleware: Middleware;
  readonly snapshot: () => CircuitSnapshot;
  readonly reset: (key?: string) => void;
}

function defaultShouldTrip(context: {
  readonly response?: HttpResponse;
  readonly error?: unknown;
}): boolean {
  if (context.error) {
    return true;
  }
  if (context.response) {
    return context.response.status >= 500;
  }
  return false;
}

/**
 * Circuit breaker middleware for downstream dependency protection.
 */
export function circuitBreaker(options: CircuitBreakerOptions = {}): Middleware {
  return createCircuitBreaker(options).middleware;
}

/**
 * Default key builder uses method + full URL, meaning parameterized
 * paths (e.g. /users/123 vs /users/456) are tracked as separate
 * circuits. For endpoint-level protection use a custom keyBuilder
 * such as keyByMethodAndPath or keyByHost from circuitBreakerKeys.
 */
function defaultKeyBuilder(req: Readonly<RequestConfig>): string {
  return `${req.method}:${req.url}`;
}

function createEntry(now: number): CircuitEntry {
  return {
    state: "closed",
    failureCount: 0,
    successCount: 0,
    openedAt: 0,
    halfOpenProbeInFlight: false,
    lastChangedAt: now,
    lastAccessedAt: now,
  };
}

/**
 * Stateful circuit breaker controller.
 * Provides middleware plus runtime inspection/reset APIs.
 */
export function createCircuitBreaker(options: CircuitBreakerOptions = {}): CircuitBreakerController {
  const failureThreshold = options.failureThreshold ?? 5;
  const successThreshold = options.successThreshold ?? 1;
  const cooldownMs = options.cooldownMs ?? 30_000;
  const shouldTrip = options.shouldTrip ?? defaultShouldTrip;

  const keyBuilder = options.keyBuilder ?? defaultKeyBuilder;
  const maxEntries = options.maxEntries ?? Number.POSITIVE_INFINITY;
  const entryTtlMs = options.entryTtlMs;
  const entries = new Map<string, CircuitEntry>();

  function evictOldestEntry(): void {
    const oldestKey = entries.keys().next().value as string | undefined;
    if (oldestKey !== undefined) {
      entries.delete(oldestKey);
    }
  }

  function pruneExpiredEntries(now: number): void {
    if (entryTtlMs === undefined || entryTtlMs <= 0) {
      return;
    }

    for (const [key, entry] of entries) {
      if (now - entry.lastAccessedAt >= entryTtlMs) {
        entries.delete(key);
      }
    }
  }

  function touchEntry(key: string, entry: CircuitEntry, now: number): void {
    entry.lastAccessedAt = now;
    entries.delete(key);
    entries.set(key, entry);
  }

  function getEntry(key: string, now: number): CircuitEntry {
    pruneExpiredEntries(now);

    const existing = entries.get(key);
    if (existing) {
      touchEntry(key, existing, now);
      return existing;
    }

    while (entries.size >= maxEntries) {
      evictOldestEntry();
    }

    const created = createEntry(now);
    entries.set(key, created);
    return created;
  }

  function openCircuit(key: string, entry: CircuitEntry, now: number): void {
    const previousState = entry.state;
    entry.state = "open";
    entry.openedAt = now;
    entry.failureCount = 0;
    entry.successCount = 0;
    entry.halfOpenProbeInFlight = false;
    entry.lastChangedAt = now;
    entry.lastAccessedAt = now;
    if (previousState !== entry.state) {
      options.hooks?.onStateChange?.({ key, from: previousState, to: entry.state, at: now });
    }
    options.hooks?.onOpen?.({ key, openedAt: now, failures: failureThreshold });
  }

  function closeCircuit(key: string, entry: CircuitEntry, now: number): void {
    const previousState = entry.state;
    entry.state = "closed";
    entry.failureCount = 0;
    entry.successCount = 0;
    entry.halfOpenProbeInFlight = false;
    entry.lastChangedAt = now;
    entry.lastAccessedAt = now;
    if (previousState !== entry.state) {
      options.hooks?.onStateChange?.({ key, from: previousState, to: entry.state, at: now });
    }
    options.hooks?.onClose?.({ key, at: now });
  }

  function moveToHalfOpen(key: string, entry: CircuitEntry, now: number): void {
    const previousState = entry.state;
    entry.state = "half-open";
    entry.successCount = 0;
    entry.halfOpenProbeInFlight = false;
    entry.lastChangedAt = now;
    entry.lastAccessedAt = now;
    if (previousState !== entry.state) {
      options.hooks?.onStateChange?.({ key, from: previousState, to: entry.state, at: now });
    }
    options.hooks?.onHalfOpen?.({ key, at: now });
  }

  const middleware: Middleware = async (req, next) => {
    const now = Date.now();
    const key = keyBuilder(req);
    const entry = getEntry(key, now);
    touchEntry(key, entry, now);

    if (entry.state === "open") {
      if (now - entry.openedAt < cooldownMs) {
        throw new PureqCircuitOpenError();
      }
      moveToHalfOpen(key, entry, now);
    }

    if (entry.state === "half-open") {
      if (entry.halfOpenProbeInFlight) {
        throw new PureqCircuitOpenError("pureq: circuit breaker half-open probe in flight");
      }
      entry.halfOpenProbeInFlight = true;
    }

    try {
      const response = await next(req);
      const shouldCountFailure = shouldTrip({ key, req, response });

      if (shouldCountFailure) {
        if (entry.state === "half-open") {
          openCircuit(key, entry, Date.now());
        } else {
          entry.failureCount += 1;
          if (entry.failureCount >= failureThreshold) {
            openCircuit(key, entry, Date.now());
          }
        }
        return response;
      }

      if (entry.state === "half-open") {
        entry.successCount += 1;
        if (entry.successCount >= successThreshold) {
          closeCircuit(key, entry, Date.now());
        }
      } else {
        entry.failureCount = 0;
      }

      return response;
    } catch (error) {
      const shouldCountFailure = shouldTrip({ key, req, error });
      if (!shouldCountFailure) {
        throw error;
      }

      if (entry.state === "half-open") {
        openCircuit(key, entry, Date.now());
      } else {
        entry.failureCount += 1;
        if (entry.failureCount >= failureThreshold) {
          openCircuit(key, entry, Date.now());
        }
      }
      throw error;
    } finally {
      if (entry.state === "half-open") {
        entry.halfOpenProbeInFlight = false;
      }

      touchEntry(key, entry, Date.now());
    }
  };

  const snapshot = (): CircuitSnapshot => {
    pruneExpiredEntries(Date.now());

    const result: CircuitSnapshotEntry[] = [];
    let closed = 0;
    let open = 0;
    let halfOpen = 0;
    for (const [key, entry] of entries) {
      if (entry.state === "closed") {
        closed += 1;
      } else if (entry.state === "open") {
        open += 1;
      } else {
        halfOpen += 1;
      }

      result.push({
        key,
        state: entry.state,
        failureCount: entry.failureCount,
        successCount: entry.successCount,
        openedAt: entry.openedAt,
        lastChangedAt: entry.lastChangedAt,
        lastAccessedAt: entry.lastAccessedAt,
      });
    }

    result.sort((a, b) => a.key.localeCompare(b.key));

    return {
      size: result.length,
      summary: {
        closed,
        open,
        halfOpen,
      },
      entries: result,
    };
  };

  const reset = (key?: string): void => {
    if (key === undefined) {
      entries.clear();
      return;
    }
    entries.delete(key);
  };

  return {
    middleware,
    snapshot,
    reset,
  };
}
