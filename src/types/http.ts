import type { HttpResponse } from "../response/response";

/**
 * Standard HTTP methods supported by the library
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/**
 * Allowed query value primitives
 */
export type QueryValue = string | number | boolean;

/**
 * Allowed query map
 */
export type QueryParams = Readonly<Record<string, QueryValue | readonly QueryValue[]>>;

export type HttpAdapter = (url: string, init: RequestInit) => Promise<Response>;

export interface BodySerializer {
  readonly serialize: (body: unknown) => {
    readonly payload: BodyInit | null;
    readonly contentType?: string;
  };
}

/**
 * Core Request configuration object
 */
export interface RequestConfig {
  /**
   * HTTP Method
   */
  readonly method: HttpMethod;
  /**
   * Request URL
   */
  readonly url: string;
  /**
   * Key-value map of path parameters (e.g., :userId)
   */
  readonly params?: Readonly<Record<string, string>>;
  /**
   * Query parameters to append to the URL
   */
  readonly query?: QueryParams;
  /**
   * Request body (typically object or string)
   */
  readonly body?: unknown;
  /**
   * Request headers
   */
  readonly headers?: Readonly<Record<string, string>>;
  /**
   * Abort signal to cancel the request
   */
  readonly signal?: AbortSignal;
  /**
   * Timeout in milliseconds
   */
  readonly timeout?: number;
}

/**
 * Middleware function following the "Onion Model" pattern
 */
export type Middleware = (
  req: RequestConfig,
  next: (req: RequestConfig) => Promise<HttpResponse>
) => Promise<HttpResponse>;

/**
 * Request interceptor
 */
export type RequestInterceptor = (
  req: Readonly<RequestConfig>
) => RequestConfig | Promise<RequestConfig>;

/**
 * Response interceptor
 */
export type ResponseInterceptor = (
  res: HttpResponse,
  req: Readonly<RequestConfig>
) => HttpResponse | Promise<HttpResponse>;

/**
 * Prioritized interceptor registration
 */
export interface InterceptorEntry<T> {
  readonly handler: T;
  readonly priority?: number;
  readonly name?: string;
}
