import type { Middleware } from "../types/http";
import { markPolicyMiddleware } from "../policy/guardrails";

/**
 * Applies a default timeout when a request does not explicitly specify one.
 */
export function defaultTimeout(timeoutMs: number): Middleware {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("pureq: defaultTimeout requires a positive timeoutMs");
  }

  const middleware: Middleware = async (req, next) => {
    if (req.timeout !== undefined) {
      return next(req);
    }

    return next({
      ...req,
      timeout: timeoutMs,
    });
  };

  return markPolicyMiddleware(middleware, {
    name: "defaultTimeout",
    kind: "timeout",
  });
}
