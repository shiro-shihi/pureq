import type { Middleware, RequestConfig } from "../types/http";
import type { HttpResponse } from "../response/response";
import { markPolicyMiddleware } from "../policy/guardrails";
import { appendPolicyTrace } from "../utils/policyTrace";

export type FallbackTrigger =
  | { readonly type: "error"; readonly error: unknown }
  | { readonly type: "response"; readonly response: HttpResponse };

export interface FallbackOptions {
  /**
   * The fallback value to return when an error occurs.
   * Can be a static HttpResponse or a function that returns one.
   */
  readonly value: HttpResponse | ((trigger: FallbackTrigger, req: RequestConfig) => HttpResponse | Promise<HttpResponse>);
  /**
   * Filters fallback activation for both error and non-OK response cases.
   * Receives a FallbackTrigger and RequestConfig; return true to invoke fallback.
   */
  readonly when?: (trigger: FallbackTrigger, req: RequestConfig) => boolean;
}

/**
 * pureq fallback middleware.
 * Implements graceful degradation by returning a default value or cached data on failure.
 */
export function fallback(options: FallbackOptions): Middleware {
  const middleware: Middleware = async (req, next) => {
    try {
      const response = await next(req);
      const trigger: FallbackTrigger = { type: "response", response };
      
      // We can also trigger fallback for specific status codes (optional)
      if (!response.ok && options.when?.(trigger, req)) {
        return resolveFallback(options.value, trigger, req, "status");
      }
      
      return response;
    } catch (error) {
      const trigger: FallbackTrigger = { type: "error", error };
      if (!options.when || options.when(trigger, req)) {
        return resolveFallback(options.value, trigger, req, "error");
      }
      throw error;
    }
  };

  async function resolveFallback(
    value: FallbackOptions["value"],
    trigger: FallbackTrigger,
    req: RequestConfig,
    source: "error" | "status"
  ): Promise<HttpResponse> {
    const finalResponse = typeof value === "function" ? await value(trigger, req) : value;

    appendPolicyTrace(req, {
      policy: "fallback",
      decision: "fallback",
      at: Date.now(),
      reason: source === "error" ? "request failed" : "unsuccessful status",
      source,
    });

    return finalResponse;
  }

  return markPolicyMiddleware(middleware, {
    name: "fallback",
    kind: "fallback",
  });
}
