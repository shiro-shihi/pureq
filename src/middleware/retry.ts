import type { Middleware, RequestConfig } from "../types/http";
import type { HttpResponse } from "../response/response";
import { markPolicyMiddleware } from "../policy/guardrails";
import { appendPolicyTrace } from "../utils/policyTrace";

export interface RetryOptions {
  readonly maxRetries: number;
  readonly delay?: number;
  readonly backoff?: boolean;
  readonly maxDelay?: number;
  readonly retryBudgetMs?: number;
  readonly retryOnStatus?: readonly number[];
  readonly retryOnNetworkError?: boolean;
  readonly respectRetryAfter?: boolean;
  readonly retryAfterHeaderName?: string;
  readonly onRetry?: (event: {
    readonly attempt: number;
    readonly waitTime: number;
    readonly status?: number;
    readonly error?: unknown;
    readonly retryAfterMs?: number;
    readonly budgetRemainingMs?: number;
    readonly source: "status" | "network";
  }) => void;
}

function isRetryableStatus(status: number, allowList?: readonly number[]): boolean {
  if (allowList && allowList.length > 0) {
    return allowList.includes(status);
  }
  return status >= 500;
}

// appendPolicyTrace is imported from ../utils/policyTrace

function parseRetryAfter(value: string | null, nowMs: number): number | undefined {
  if (!value) {
    return undefined;
  }

  const deltaSeconds = Number(value);
  if (Number.isFinite(deltaSeconds)) {
    return Math.max(0, Math.round(deltaSeconds * 1000));
  }

  const parsedDate = Date.parse(value);
  if (!Number.isNaN(parsedDate)) {
    return Math.max(0, parsedDate - nowMs);
  }

  return undefined;
}

async function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/**
 * pureq Retry Middleware
 * Implements exponential backoff strategy for network failures or configured status codes.
 */
export function retry(options: RetryOptions): Middleware {
  if (!Number.isInteger(options.maxRetries) || options.maxRetries < 0) {
    throw new Error("pureq: retry requires maxRetries to be a non-negative integer");
  }

  const {
    maxRetries,
    delay = 300,
    backoff = true,
    maxDelay = 5_000,
    retryBudgetMs,
    retryOnStatus,
    retryOnNetworkError = true,
    respectRetryAfter = true,
    retryAfterHeaderName = "retry-after",
    onRetry,
  } = options;

  const middleware: Middleware = async (req, next) => {
    let attempts = 0;
    let totalWaitMs = 0;

    const hasBudget = retryBudgetMs !== undefined && Number.isFinite(retryBudgetMs) && retryBudgetMs > 0;

    const withRetryMeta = () => {
      const hasMeta = typeof req === "object" && req !== null && "_meta" in req;
      const currentMeta = hasMeta
        ? ((req as { _meta?: Record<string, unknown> })._meta ?? {})
        : {};

      currentMeta.retryCount = attempts;

      if (hasMeta) {
        return req;
      }

      return {
        ...req,
        _meta: currentMeta,
      };
    };

    const executeWithRetry = async (): Promise<HttpResponse> => {
      try {
        const res = await next(withRetryMeta());

        if (isRetryableStatus(res.status, retryOnStatus) && attempts < maxRetries) {
          attempts++;
          const baseWait = backoff ? Math.min(delay * 2 ** (attempts - 1), maxDelay) : delay;
          const retryAfterMs = respectRetryAfter
            ? parseRetryAfter(res.headers.get(retryAfterHeaderName), Date.now())
            : undefined;
          const waitTime = Math.max(baseWait, retryAfterMs ?? 0);
          const budgetRemainingMs = hasBudget ? Math.max(0, retryBudgetMs - totalWaitMs) : undefined;

          if (budgetRemainingMs !== undefined && waitTime > budgetRemainingMs) {
            appendPolicyTrace(req, {
              policy: "retry",
              decision: "skip",
              at: Date.now(),
              attempt: attempts,
              reason: "retry budget exhausted",
              waitTimeMs: waitTime,
              status: res.status,
              ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
              budgetRemainingMs,
              source: "status",
            });
            return res;
          }

          appendPolicyTrace(req, {
            policy: "retry",
            decision: "retry",
            at: Date.now(),
            attempt: attempts,
            reason: `retryable status ${res.status}`,
            waitTimeMs: waitTime,
            status: res.status,
            ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
            ...(budgetRemainingMs !== undefined ? { budgetRemainingMs } : {}),
            source: "status",
          });
          onRetry?.({
            attempt: attempts,
            waitTime,
            status: res.status,
            ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
            ...(budgetRemainingMs !== undefined ? { budgetRemainingMs } : {}),
            source: "status",
          });
          totalWaitMs += waitTime;
          await sleep(waitTime, req.signal);
          return executeWithRetry();
        }

        return res;
      } catch (error) {
        if (!retryOnNetworkError) {
          throw error;
        }
        if (attempts < maxRetries) {
          attempts++;
          const waitTime = backoff ? Math.min(delay * 2 ** (attempts - 1), maxDelay) : delay;
          const budgetRemainingMs = hasBudget ? Math.max(0, retryBudgetMs - totalWaitMs) : undefined;

          if (budgetRemainingMs !== undefined && waitTime > budgetRemainingMs) {
            appendPolicyTrace(req, {
              policy: "retry",
              decision: "give-up",
              at: Date.now(),
              attempt: attempts,
              reason: "retry budget exhausted",
              waitTimeMs: waitTime,
              budgetRemainingMs,
              source: "network",
            });
            if (typeof error === "object" && error !== null) {
              (error as { __pureqRetryCount?: number }).__pureqRetryCount = attempts - 1;
            }
            throw error;
          }

          appendPolicyTrace(req, {
            policy: "retry",
            decision: "retry",
            at: Date.now(),
            attempt: attempts,
            reason: "network failure",
            waitTimeMs: waitTime,
            ...(budgetRemainingMs !== undefined ? { budgetRemainingMs } : {}),
            source: "network",
          });
          onRetry?.({
            attempt: attempts,
            waitTime,
            error,
            ...(budgetRemainingMs !== undefined ? { budgetRemainingMs } : {}),
            source: "network",
          });
          totalWaitMs += waitTime;
          await sleep(waitTime, req.signal);
          return executeWithRetry();
        }

        if (typeof error === "object" && error !== null) {
          (error as { __pureqRetryCount?: number }).__pureqRetryCount = attempts;
        }

        throw error;
      }
    };

    return executeWithRetry();
  };

  return markPolicyMiddleware(middleware, {
    name: "retry",
    kind: "retry",
    maxRetries,
  });
}
