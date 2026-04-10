import type { Middleware } from "../types/http";
import { markPolicyMiddleware } from "../policy/guardrails";

export interface DeadlineOptions {
  readonly defaultTimeoutMs?: number;
  readonly now?: () => number;
}

function resolveDeadlineAt(
  req: { readonly timeout?: number; readonly _meta?: Readonly<Record<string, unknown>> },
  now: number,
  defaultTimeoutMs?: number
): number | undefined {
  const existing = req._meta?.deadlineAt;
  if (typeof existing === "number" && Number.isFinite(existing)) {
    return existing;
  }

  if (req.timeout !== undefined) {
    if (!Number.isFinite(req.timeout) || req.timeout <= 0) {
      throw new Error("pureq: deadline requires timeout to be a positive number");
    }
    return now + req.timeout;
  }

  if (defaultTimeoutMs !== undefined) {
    if (!Number.isFinite(defaultTimeoutMs) || defaultTimeoutMs <= 0) {
      throw new Error("pureq: deadline defaultTimeoutMs must be a positive number");
    }
    return now + defaultTimeoutMs;
  }

  return undefined;
}

function readMeta(req: { readonly _meta?: Readonly<Record<string, unknown>> } | object):
  | Readonly<Record<string, unknown>>
  | undefined {
  if (typeof req !== "object" || req === null || !("_meta" in req)) {
    return undefined;
  }

  return (req as { readonly _meta?: Readonly<Record<string, unknown>> })._meta;
}

function timeoutError(deadlineAt: number, now: number): Error {
  const elapsed = Math.max(0, Math.round(now - deadlineAt));
  return new Error(`pureq: request timeout after deadline exceeded (${elapsed}ms past deadline)`);
}

function joinSignal(
  externalSignal: AbortSignal | undefined,
  remainingMs: number,
  deadlineAt: number,
  now: () => number
): {
  readonly signal: AbortSignal;
  readonly cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(timeoutError(deadlineAt, now()));
  }, remainingMs);

  const onExternalAbort = () => {
    controller.abort(externalSignal?.reason ?? new DOMException("Aborted", "AbortError"));
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      onExternalAbort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  const cleanup = () => {
    clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  };

  return {
    signal: controller.signal,
    cleanup,
  };
}

/**
 * Applies a total request deadline that is preserved across retries.
 */
export function deadline(options: DeadlineOptions = {}): Middleware {
  const middleware: Middleware = async (req, next) => {
    const nowFactory = options.now ?? Date.now;
    const startedAt = nowFactory();
    const existingMeta = readMeta(req);
    const deadlineAt = resolveDeadlineAt(
      {
        ...(req.timeout !== undefined ? { timeout: req.timeout } : {}),
        ...(existingMeta ? { _meta: existingMeta } : {}),
      },
      startedAt,
      options.defaultTimeoutMs
    );

    if (deadlineAt === undefined) {
      return next(req);
    }

    const remainingMs = Math.max(0, Math.ceil(deadlineAt - startedAt));
    if (remainingMs <= 0) {
      throw timeoutError(deadlineAt, startedAt);
    }

    const { signal, cleanup } = joinSignal(req.signal, remainingMs, deadlineAt, nowFactory);

    try {
      const nextReq = {
        ...req,
        signal,
        timeout: Math.min(req.timeout ?? remainingMs, remainingMs),
        _meta: {
          ...(existingMeta ?? {}),
          deadlineAt,
        },
      };

      return await next(nextReq);
    } finally {
      cleanup();
    }
  };

  return markPolicyMiddleware(middleware, {
    name: "deadline",
    kind: "timeout",
  });
}
