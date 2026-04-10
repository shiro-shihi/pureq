import type { Middleware, RequestConfig } from "../types/http";
import { toPureqError } from "../types/result";
import type { PolicyTraceEntry, TransportEvent } from "../types/events";

export type DiagnosticEvent = TransportEvent & {
  readonly method: RequestConfig["method"];
  readonly durationMs: number;
};

export interface DiagnosticsSnapshot {
  readonly total: number;
  readonly success: number;
  readonly failed: number;
  readonly p50: number;
  readonly p95: number;
  readonly recentEvents: readonly DiagnosticEvent[];
}

export interface DiagnosticsController {
  readonly middleware: Middleware;
  readonly snapshot: () => DiagnosticsSnapshot;
  readonly reset: () => void;
}

export interface DiagnosticsOptions {
  readonly maxEvents?: number;
  readonly onEvent?: (event: DiagnosticEvent) => void;
}

function getMetaValue(req: RequestConfig, key: string): unknown {
  if (typeof req !== "object" || req === null || !("_meta" in req)) {
    return undefined;
  }

  const meta = (req as { _meta?: Readonly<Record<string, unknown>> })._meta;
  if (!meta) {
    return undefined;
  }

  return meta[key];
}

function getPolicyTrace(req: RequestConfig): readonly PolicyTraceEntry[] | undefined {
  const value = getMetaValue(req, "policyTrace");
  return Array.isArray(value) ? (value as readonly PolicyTraceEntry[]) : undefined;
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx] ?? 0;
}

/**
 * Middleware diagnostics collector for runtime policy visibility.
 */
export function createMiddlewareDiagnostics(options: DiagnosticsOptions = {}): DiagnosticsController {
  const maxEvents = options.maxEvents ?? 200;
  const durations: number[] = [];
  const events: DiagnosticEvent[] = [];
  let total = 0;
  let success = 0;
  let failed = 0;

  const middleware: Middleware = async (req, next) => {
    const startedAt = Date.now();
    const requestIdMeta = getMetaValue(req, "requestId");
    const retryCountMeta = getMetaValue(req, "retryCount");
    const requestId = typeof requestIdMeta === "string" ? requestIdMeta : undefined;
    const retryCount = typeof retryCountMeta === "number" ? retryCountMeta : undefined;

    try {
      const response = await next(req);
      const durationMs = Date.now() - startedAt;
      const policyTrace = getPolicyTrace(req);
      total += 1;
      success += 1;
      durations.push(durationMs);
      // Cap durations array to prevent unbounded memory growth
      if (durations.length > maxEvents) {
        durations.splice(0, durations.length - maxEvents);
      }
      events.push({
        phase: "success",
        at: Date.now(),
        ...(requestId !== undefined ? { requestId } : {}),
        method: req.method,
        url: req.url,
        startedAt,
        status: response.status,
        durationMs,
        ...(retryCount !== undefined ? { retryCount } : {}),
        ...(policyTrace !== undefined ? { policyTrace } : {}),
      });
      const latest = events[events.length - 1];
      if (latest) {
        options.onEvent?.(latest);
      }
      if (events.length > maxEvents) {
        events.splice(0, events.length - maxEvents);
      }
      return response;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const normalized = toPureqError(error, {
        method: req.method,
        url: req.url,
      });
      total += 1;
      failed += 1;
      durations.push(durationMs);
      // Cap durations array to prevent unbounded memory growth
      if (durations.length > maxEvents) {
        durations.splice(0, durations.length - maxEvents);
      }
      const policyTrace = getPolicyTrace(req);
      events.push({
        phase: "error",
        at: Date.now(),
        ...(requestId !== undefined ? { requestId } : {}),
        method: req.method,
        url: req.url,
        startedAt,
        durationMs,
        errorKind: normalized.kind,
        ...(retryCount !== undefined ? { retryCount } : {}),
        ...(policyTrace !== undefined ? { policyTrace } : {}),
      });
      const latest = events[events.length - 1];
      if (latest) {
        options.onEvent?.(latest);
      }
      if (events.length > maxEvents) {
        events.splice(0, events.length - maxEvents);
      }
      throw error;
    }
  };

  const snapshot = (): DiagnosticsSnapshot => {
    return {
      total,
      success,
      failed,
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      recentEvents: [...events],
    };
  };

  const reset = (): void => {
    total = 0;
    success = 0;
    failed = 0;
    durations.length = 0;
    events.length = 0;
  };

  return {
    middleware,
    snapshot,
    reset,
  };
}
