import type { RequestConfig, Middleware } from "./http";
import type { HttpResponse } from "../response/response";

/**
 * Internal symbols for hiding implementation details from public API
 */
export const INTERNAL_MIDDLEWARES = Symbol("pureq:middlewares");

/**
 * Internal request state with middleware queue
 */
export interface InternalRequestConfig extends RequestConfig {
  /**
   * Middleware chain local to this specific request
   */
  readonly [INTERNAL_MIDDLEWARES]: readonly Middleware[];
}

/**
 * Type of a middleware executor after composition
 */
export type ComposedMiddleware = (req: InternalRequestConfig) => Promise<HttpResponse>;
