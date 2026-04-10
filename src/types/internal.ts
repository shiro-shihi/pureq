import type { RequestConfig, Middleware } from "./http";
import type { HttpResponse } from "../response/response";

/**
 * Internal request state with middleware queue
 */
export interface InternalRequestConfig extends RequestConfig {
  /**
   * Middleware chain local to this specific request
   */
  readonly _middlewares: readonly Middleware[];
  /**
   * Optional metadata container for internal instrumentation.
   */
  readonly _meta?: Readonly<Record<string, unknown>>;
}

/**
 * Type of a middleware executor after composition
 */
export type ComposedMiddleware = (req: InternalRequestConfig) => Promise<HttpResponse>;
