import type { Middleware, RequestConfig } from "../types/http";
import type { HttpResponse } from "../response/response";
import { appendPolicyTrace, deepCopyMeta } from "../utils/policyTrace";

export interface HedgeOptions {
  readonly hedgeAfterMs: number;
  readonly methods?: readonly RequestConfig["method"][];
  readonly keyBuilder?: (req: Readonly<RequestConfig>) => string;
  readonly maxParallel?: number;
}

/**
 * Creates a forked AbortSignal that mirrors the parent signal
 * but can be independently aborted when the race is decided.
 */
function forkSignal(signal: AbortSignal | undefined): { readonly signal: AbortSignal; readonly cleanup: () => void } {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason ?? new DOMException("Aborted", "AbortError"));

  if (signal) {
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
    },
  };
}

/**
 * Sends a duplicate request after a short delay and returns the first successful response.
 *
 * NOTE: The current implementation always launches exactly 2 requests
 * (1 primary + 1 hedge). The maxParallel option controls whether hedging
 * is enabled (>= 2) or disabled (< 2). Values above 2 are accepted but
 * behave identically to 2.
 */
export function hedge(options: HedgeOptions): Middleware {
  if (!Number.isFinite(options.hedgeAfterMs) || options.hedgeAfterMs < 0) {
    throw new Error("pureq: hedge requires a non-negative hedgeAfterMs");
  }

  const methods = new Set(options.methods ?? ["GET"]);
  const keyBuilder = options.keyBuilder ?? ((req) => `${req.method}:${req.url}`);
  const maxParallel = Math.max(1, options.maxParallel ?? 2);

  return async (req, next) => {
    if (!methods.has(req.method) || maxParallel < 2) {
      return next(req);
    }

    const key = keyBuilder(req);
    const startedAt = Date.now();

    // Each fork gets its own deep-copied meta to prevent
    // cross-fork trace pollution (race condition prevention).
    const primaryFork = forkSignal(req.signal);
    const primaryReq: RequestConfig = {
      ...req,
      signal: primaryFork.signal,
      meta: deepCopyMeta(req),
    };
    const primaryPromise = next(primaryReq);

    // Track how many promises are actually in flight for the rejection threshold.
    let totalPromises = 1;

    let hedgeResolve: ((response: HttpResponse) => void) | undefined;
    let hedgeReject: ((error: unknown) => void) | undefined;
    const hedgePromise = new Promise<HttpResponse>((resolve, reject) => {
      hedgeResolve = resolve;
      hedgeReject = reject;
    });

    let hedgeFork: { readonly signal: AbortSignal; readonly cleanup: () => void } | undefined;
    const timer = setTimeout(() => {
      hedgeFork = forkSignal(req.signal);
      const hedgedReq: RequestConfig = {
        ...req,
        signal: hedgeFork.signal,
        meta: deepCopyMeta(req),
      };
      appendPolicyTrace(hedgedReq, {
        policy: "hedge",
        decision: "launch",
        at: Date.now(),
        reason: "hedge timer elapsed",
        key,
      });

      totalPromises = 2;
      next(hedgedReq).then(hedgeResolve, hedgeReject);
    }, options.hedgeAfterMs);

    const finish = async (winner: HttpResponse): Promise<HttpResponse> => {
      clearTimeout(timer);
      primaryFork.cleanup();
      hedgeFork?.cleanup();
      appendPolicyTrace(req, {
        policy: "hedge",
        decision: "success",
        at: Date.now(),
        reason: "first response won the race",
        key,
        ageMs: Date.now() - startedAt,
      });
      return winner;
    };

    try {
      return await new Promise<HttpResponse>((resolve, reject) => {
        const errors: unknown[] = [];
        let rejectedCount = 0;

        const onFulfill = (response: HttpResponse) => {
          finish(response).then(resolve, reject);
        };

        const onReject = (error: unknown) => {
          errors.push(error);
          rejectedCount += 1;
          // Use actual number of in-flight promises instead of a hardcoded value
          if (rejectedCount >= totalPromises) {
            const aggregate = new Error("pureq: hedged requests failed");
            (aggregate as Error & { causes?: unknown[] }).causes = errors;
            reject(aggregate);
          }
        };

        primaryPromise.then(onFulfill, onReject);
        hedgePromise.then(onFulfill, onReject);
      });
    } catch (error) {
      clearTimeout(timer);
      primaryFork.cleanup();
      hedgeFork?.cleanup();
      throw error;
    }
  };
}
