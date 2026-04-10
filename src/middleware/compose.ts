import type { Middleware } from "../types/http";
import type { InternalRequestConfig } from "../types/internal";
import type { HttpResponse } from "../response/response";
import { execute } from "../executor/execute";

/**
 * Composes multiple middlewares into a single executable function.
 * Implements the "Onion Model" with re-entry prevention via index tracking.
 */
export function compose(
  middlewares: readonly Middleware[],
  executor: (req: InternalRequestConfig) => Promise<HttpResponse> = execute
) {
  return function (req: InternalRequestConfig): Promise<HttpResponse> {
    function dispatch(i: number, currentConfig: InternalRequestConfig): Promise<HttpResponse> {
      const middleware = middlewares[i];

      // After the last middleware, run the executor
      if (!middleware) {
        return executor(currentConfig);
      }

      // Guards against concurrent calls to next() within a single middleware.
      // The flag is reset in the finally block after dispatch completes,
      // which intentionally allows sequential re-invocation of next()
      // (e.g. in an error-recovery path). Only truly parallel calls are rejected.
      let nextInFlight = false;

      try {
        return middleware(currentConfig, async (nextConfig) => {
          if (nextInFlight) {
            throw new Error("pureq: next() was called multiple times in a single middleware");
          }

          nextInFlight = true;
          const nextReq: InternalRequestConfig = {
            ...currentConfig,
            ...nextConfig,
            _middlewares: currentConfig._middlewares,
          };

          try {
            return await dispatch(i + 1, nextReq);
          } finally {
            nextInFlight = false;
          }
        });
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return dispatch(0, req);
  };
}
