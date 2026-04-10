import type {
  BodySerializer,
  HttpAdapter,
  InterceptorEntry,
  Middleware,
  RequestConfig,
  RequestInterceptor,
  ResponseInterceptor,
} from "../types/http";
import type { InternalRequestConfig } from "../types/internal";
import { INTERNAL_MIDDLEWARES } from "../types/internal";
import type { ExtractParams } from "../utils/url";
import { compose } from "../middleware/compose";
import type { HttpResponse } from "../response/response";
import { execute } from "../executor/execute";
import { validatePolicyGuardrails } from "../policy/guardrails";
import { generateSecureId } from "../utils/crypto";
import {
  err,
  httpErrorFromResponse,
  ok,
  toPureqError,
  type HttpResult,
  type PureqError,
  type PureqErrorMetadata,
  type Result,
} from "../types/result";
import type {
  TransportErrorEvent,
  TransportStartEvent,
  TransportSuccessEvent,
} from "../types/events";

type PathParams<Path extends string> = keyof ExtractParams<Path> extends never
  ? { readonly params?: ExtractParams<Path> }
  : { readonly params: ExtractParams<Path> };

type RequestOptionsFor<Path extends string> = PathParams<Path> &
  Omit<RequestConfig, "method" | "url" | "params">;

type FetchLikeRequestOptions = Omit<RequestConfig, "method" | "url"> & {
  readonly method?: RequestConfig["method"];
};

type JsonResult<T> = Result<T, PureqError>;

interface TraceContext {
  readonly traceparent?: string;
  readonly tracestate?: string;
}

export interface RequestStartEvent {
  readonly phase: "start";
  readonly at: TransportStartEvent["at"];
  readonly requestId: string;
  readonly method: TransportStartEvent["method"];
  readonly url: TransportStartEvent["url"];
  readonly startedAt: TransportStartEvent["startedAt"];
}

export interface RequestSuccessEvent {
  readonly phase: "success";
  readonly at: TransportSuccessEvent["at"];
  readonly requestId: string;
  readonly method: TransportSuccessEvent["method"];
  readonly url: TransportSuccessEvent["url"];
  readonly startedAt: TransportSuccessEvent["startedAt"];
  readonly latencyMs: TransportSuccessEvent["durationMs"];
  readonly durationMs: TransportSuccessEvent["durationMs"];
  readonly status: TransportSuccessEvent["status"];
  readonly retryCount: TransportSuccessEvent["retryCount"];
}

export interface RequestErrorEvent {
  readonly phase: "error";
  readonly at: TransportErrorEvent["at"];
  readonly requestId: string;
  readonly method: TransportErrorEvent["method"];
  readonly url: TransportErrorEvent["url"];
  readonly startedAt: TransportErrorEvent["startedAt"];
  readonly latencyMs: TransportErrorEvent["durationMs"];
  readonly durationMs: TransportErrorEvent["durationMs"];
  readonly errorKind: TransportErrorEvent["errorKind"];
  readonly error: PureqError;
}

export interface ObservabilityHooks {
  readonly onRequestStart?: (event: RequestStartEvent) => void;
  readonly onRequestSuccess?: (event: RequestSuccessEvent) => void;
  readonly onRequestError?: (event: RequestErrorEvent) => void;
}

/**
 * Initial configuration for the client
 */
export interface ClientOptions {
  readonly baseURL?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly middlewares?: readonly Middleware[];
  readonly requestInterceptors?: readonly InterceptorEntry<RequestInterceptor>[];
  readonly responseInterceptors?: readonly InterceptorEntry<ResponseInterceptor>[];
  readonly hooks?: ObservabilityHooks;
  readonly requestIdHeaderName?: string;
  readonly requestIdFactory?: () => string;
  readonly traceContextProvider?: () => TraceContext | undefined;
  readonly adapter?: HttpAdapter;
  readonly bodySerializer?: BodySerializer;
}

/**
 * Represents the main pureq library client instance.
 * All client instances are immutable; adding middleware or changing configuration
 * returns a new instance of the client.
 */
export interface PureqClient {
  /**
   * Extends the current client with a new middleware.
   * @param middleware - The middleware function to register
   * @returns A NEW PureqClient instance with the middleware applied
   */
  readonly use: (middleware: Middleware) => PureqClient;
  /**
   * Registers a request interceptor and returns a new client instance.
   */
  readonly useRequestInterceptor: (
    interceptor: RequestInterceptor,
    options?: { readonly priority?: number; readonly name?: string }
  ) => PureqClient;
  /**
   * Registers a response interceptor and returns a new client instance.
   */
  readonly useResponseInterceptor: (
    interceptor: ResponseInterceptor,
    options?: { readonly priority?: number; readonly name?: string }
  ) => PureqClient;

  /**
   * Performs an asynchronous GET request.
   * Path parameters defined in the URL (e.g., :id) are type-checked.
   *
   * @param url - The URL template (e.g., "/users/:id")
   * @param options - Request options including path params, headers, and signal
   */
  readonly get: <Path extends string>(
    url: Path,
    options?: RequestOptionsFor<Path>
  ) => Promise<HttpResponse>;
  /**
   * Non-throwing GET that returns Result<HttpResponse, PureqError>.
   */
  readonly getResult: <Path extends string>(
    url: Path,
    options?: RequestOptionsFor<Path>
  ) => Promise<HttpResult>;

  /**
   * Performs an asynchronous POST request.
   */
  readonly post: <Path extends string>(
    url: Path,
    body?: unknown,
    options?: Omit<RequestOptionsFor<Path>, "body">
  ) => Promise<HttpResponse>;
  /**
   * Non-throwing POST that returns Result<HttpResponse, PureqError>.
   */
  readonly postResult: <Path extends string>(
    url: Path,
    body?: unknown,
    options?: Omit<RequestOptionsFor<Path>, "body">
  ) => Promise<HttpResult>;
  /**
   * Performs an asynchronous PUT request.
   */
  readonly put: <Path extends string>(
    url: Path,
    body?: unknown,
    options?: Omit<RequestOptionsFor<Path>, "body">
  ) => Promise<HttpResponse>;
  readonly putResult: <Path extends string>(
    url: Path,
    body?: unknown,
    options?: Omit<RequestOptionsFor<Path>, "body">
  ) => Promise<HttpResult>;
  /**
   * Performs an asynchronous PATCH request.
   */
  readonly patch: <Path extends string>(
    url: Path,
    body?: unknown,
    options?: Omit<RequestOptionsFor<Path>, "body">
  ) => Promise<HttpResponse>;
  readonly patchResult: <Path extends string>(
    url: Path,
    body?: unknown,
    options?: Omit<RequestOptionsFor<Path>, "body">
  ) => Promise<HttpResult>;
  /**
   * Performs an asynchronous DELETE request.
   */
  readonly delete: <Path extends string>(
    url: Path,
    options?: RequestOptionsFor<Path>
  ) => Promise<HttpResponse>;
  readonly deleteResult: <Path extends string>(
    url: Path,
    options?: RequestOptionsFor<Path>
  ) => Promise<HttpResult>;

  /**
   * Beginner-friendly fetch-like entry point with a familiar `(url, init)` shape.
   */
  readonly fetch: <Path extends string>(
    url: Path,
    init?: FetchLikeRequestOptions
  ) => Promise<HttpResponse>;
  /**
   * Non-throwing fetch-like entry point.
   */
  readonly fetchResult: <Path extends string>(
    url: Path,
    init?: FetchLikeRequestOptions
  ) => Promise<HttpResult>;
  /**
   * Beginner-friendly fetch-like helper that returns parsed JSON.
   */
  readonly fetchJson: <T, Path extends string = string>(
    url: Path,
    init?: FetchLikeRequestOptions
  ) => Promise<T>;

  /**
   * A low-level generic request method that accepts a full config object.
   */
  readonly request: <Path extends string>(
    config: { readonly url: Path } & PathParams<Path> & Omit<RequestConfig, "url" | "params">
  ) => Promise<HttpResponse>;
  /**
   * Non-throwing generic request.
   */
  readonly requestResult: <Path extends string>(
    config: { readonly url: Path } & PathParams<Path> & Omit<RequestConfig, "url" | "params">
  ) => Promise<HttpResult>;

  /**
   * Beginner-friendly helper that performs request + HTTP status check + JSON parsing.
   * Throws on transport, HTTP, or JSON parse failures.
   */
  readonly requestJson: <T, Path extends string = string>(
    config: { readonly url: Path } & PathParams<Path> & Omit<RequestConfig, "url" | "params">
  ) => Promise<T>;
  /**
   * Non-throwing version of requestJson.
   */
  readonly requestJsonResult: <T, Path extends string = string>(
    config: { readonly url: Path } & PathParams<Path> & Omit<RequestConfig, "url" | "params">
  ) => Promise<JsonResult<T>>;

  /**
   * Beginner-friendly GET helper that returns parsed JSON.
   */
  readonly getJson: <T, Path extends string = string>(
    url: Path,
    options?: RequestOptionsFor<Path>
  ) => Promise<T>;
  /**
   * Non-throwing GET helper that returns parsed JSON in Result.
   */
  readonly getJsonResult: <T, Path extends string = string>(
    url: Path,
    options?: RequestOptionsFor<Path>
  ) => Promise<JsonResult<T>>;

  /**
   * Beginner-friendly POST helper that returns parsed JSON.
   */
  readonly postJson: <T, Path extends string = string>(
    url: Path,
    body?: unknown,
    options?: Omit<RequestOptionsFor<Path>, "body">
  ) => Promise<T>;
  /**
   * Non-throwing POST helper that returns parsed JSON in Result.
   */
  readonly postJsonResult: <T, Path extends string = string>(
    url: Path,
    body?: unknown,
    options?: Omit<RequestOptionsFor<Path>, "body">
  ) => Promise<JsonResult<T>>;
}

function sortByPriority<T>(items: readonly InterceptorEntry<T>[]): readonly InterceptorEntry<T>[] {
  return [...items].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

/**
 * Creates a new, immutable pureq client.
 */
export function createClient(baseOptions: ClientOptions = {}): PureqClient {
  const commonMiddlewares = baseOptions.middlewares || [];
  validatePolicyGuardrails(commonMiddlewares);
  const requestInterceptors = sortByPriority(baseOptions.requestInterceptors ?? []);
  const responseInterceptors = sortByPriority(baseOptions.responseInterceptors ?? []);
  const requestIdHeaderName = baseOptions.requestIdHeaderName ?? "x-request-id";

  function defaultRequestIdFactory(): string {
    return generateSecureId("pureq");
  }

  const requestIdFactory = baseOptions.requestIdFactory ?? defaultRequestIdFactory;
  const executeWithBoundaries = (req: InternalRequestConfig) => {
    const options = {
      ...(baseOptions.adapter !== undefined ? { adapter: baseOptions.adapter } : {}),
      ...(baseOptions.bodySerializer !== undefined
        ? { bodySerializer: baseOptions.bodySerializer }
        : {}),
    };
    return execute(req, options);
  };

  function errorMetadataFromRequest(
    req: InternalRequestConfig,
    cause?: unknown
  ): PureqErrorMetadata {
    const retryCountFromReq =
      typeof (req.meta as any)?.retryCount === "number" ? (req.meta as any).retryCount : undefined;
    const retryCountFromCause =
      typeof cause === "object" && cause !== null && "__pureqRetryCount" in cause
        ? (cause as { __pureqRetryCount?: unknown }).__pureqRetryCount
        : undefined;

    const requestId = typeof (req.meta as any)?.requestId === "string" ? (req.meta as any).requestId : undefined;
    const retryCount =
      typeof retryCountFromCause === "number"
        ? retryCountFromCause
        : retryCountFromReq;

    return {
      method: req.method,
      url: req.url,
      ...(requestId !== undefined ? { requestId } : {}),
      ...(retryCount !== undefined ? { retryCount } : {}),
    };
  }

  /**
   * Internal execution logic
   */
  async function run(req: InternalRequestConfig): Promise<HttpResponse> {
    let transformedReq: InternalRequestConfig = req;

    const requestId =
      typeof (transformedReq.meta as any)?.requestId === "string"
        ? (transformedReq.meta as any).requestId
        : requestIdFactory();
    const startedAt =
      typeof (transformedReq.meta as any)?.startedAt === "number"
        ? (transformedReq.meta as any).startedAt
        : Date.now();

    baseOptions.hooks?.onRequestStart?.({
      phase: "start",
      at: startedAt,
      requestId,
      method: transformedReq.method,
      url: transformedReq.url,
      startedAt,
    });

    for (const interceptor of requestInterceptors) {
      const nextReq = await interceptor.handler(transformedReq);
      transformedReq = {
        ...transformedReq,
        ...nextReq,
        [INTERNAL_MIDDLEWARES]: transformedReq[INTERNAL_MIDDLEWARES],
      };
    }

    const allMiddlewares = [...commonMiddlewares, ...transformedReq[INTERNAL_MIDDLEWARES]];
    const dispatchFn = compose(allMiddlewares, executeWithBoundaries);
    let response = await dispatchFn(transformedReq);

    for (const interceptor of responseInterceptors) {
      response = await interceptor.handler(response, transformedReq);
    }

    const latencyMs = Date.now() - startedAt;
    baseOptions.hooks?.onRequestSuccess?.({
      phase: "success",
      at: Date.now(),
      requestId,
      method: transformedReq.method,
      url: transformedReq.url,
      startedAt,
      latencyMs,
      durationMs: latencyMs,
      status: response.status,
      retryCount:
        typeof (transformedReq.meta as any)?.retryCount === "number"
          ? (transformedReq.meta as any).retryCount
          : 0,
    });

    return response;
  }

  async function runResult(req: InternalRequestConfig): Promise<HttpResult> {
    try {
      return ok(await run(req));
    } catch (cause) {
      const error = toPureqError(cause, errorMetadataFromRequest(req, cause));
      const startedAt =
        typeof (req.meta as any)?.startedAt === "number" ? (req.meta as any).startedAt : Date.now();
      const requestId =
        typeof (req.meta as any)?.requestId === "string" ? (req.meta as any).requestId : requestIdFactory();
      const latencyMs = Date.now() - startedAt;

      baseOptions.hooks?.onRequestError?.({
        phase: "error",
        at: Date.now(),
        requestId,
        method: req.method,
        url: req.url,
        startedAt,
        latencyMs,
        durationMs: latencyMs,
        errorKind: error.kind,
        error,
      });

      return err(error);
    }
  }

  async function toJsonResult<T>(
    resultOrPromise: HttpResult | Promise<HttpResult>,
    reqForMeta: InternalRequestConfig
  ): Promise<JsonResult<T>> {
    const result = await resultOrPromise;

    if (!result.ok) {
      return result;
    }

    const response = result.data;
    if (!response.ok) {
      return err(httpErrorFromResponse(response, errorMetadataFromRequest(reqForMeta)));
    }

    try {
      const data = await response.json<T>();
      return ok(data);
    } catch (cause) {
      return err(toPureqError(cause, errorMetadataFromRequest(reqForMeta, cause)));
    }
  }

  async function toJson<T>(
    resultOrPromise: HttpResult | Promise<HttpResult>,
    reqForMeta: InternalRequestConfig
  ): Promise<T> {
    const parsed = await toJsonResult<T>(resultOrPromise, reqForMeta);
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }
    return parsed.data;
  }

  /**
   * Request template preparation
   */
  function prepareRequest(
    method: RequestConfig["method"],
    url: string,
    options: {
      readonly params?: RequestConfig["params"];
      readonly query?: RequestConfig["query"];
      readonly body?: RequestConfig["body"];
      readonly headers?: RequestConfig["headers"];
      readonly signal?: RequestConfig["signal"];
      readonly timeout?: RequestConfig["timeout"];
    } = {}
  ): InternalRequestConfig {
    const formattedBaseURL = baseOptions.baseURL?.replace(/\/$/, "") ?? "";
    const isAbsoluteURL = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(url);
    const isProtocolRelativeURL = url.startsWith("//");
    const isAbsolutePath = url.startsWith("/");

    const fullURL =
      isAbsoluteURL || isProtocolRelativeURL
        ? url
        : formattedBaseURL
          ? `${formattedBaseURL}${isAbsolutePath ? url : `/${url}`}`
          : url;
    const requestId = requestIdFactory();

    const mergedHeaders: Record<string, string> = {
      ...(baseOptions.headers ?? {}),
      ...(options.headers ?? {}),
    };

    if (!(requestIdHeaderName in mergedHeaders)) {
      mergedHeaders[requestIdHeaderName] = requestId;
    }

    const traceContext = baseOptions.traceContextProvider?.();
    if (traceContext?.traceparent && !mergedHeaders.traceparent) {
      mergedHeaders.traceparent = traceContext.traceparent;
    }
    if (traceContext?.tracestate && !mergedHeaders.tracestate) {
      mergedHeaders.tracestate = traceContext.tracestate;
    }

    return {
      method,
      url: fullURL,
      ...(options.params !== undefined ? { params: options.params } : {}),
      ...(options.query !== undefined ? { query: options.query } : {}),
      ...(options.body !== undefined ? { body: options.body } : {}),
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
      ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
      headers: mergedHeaders,
      [INTERNAL_MIDDLEWARES]: [],
      meta: {
        requestId,
        startedAt: Date.now(),
        retryCount: 0,
      },
    } as InternalRequestConfig;
  }

  function prepareFetchRequest(
    url: string,
    init: FetchLikeRequestOptions = {}
  ): InternalRequestConfig {
    const { method, ...rest } = init;
    return prepareRequest(method ?? "GET", url, rest);
  }

  /**
   * Shared helper for body-carrying methods (POST, PUT, PATCH) to avoid
   * repeating the same options-spreading boilerplate.
   */
  function prepareBodyRequest(
    method: RequestConfig["method"],
    url: string,
    body: unknown | undefined,
    options?: {
      readonly params?: RequestConfig["params"];
      readonly query?: RequestConfig["query"];
      readonly headers?: RequestConfig["headers"];
      readonly signal?: RequestConfig["signal"];
      readonly timeout?: RequestConfig["timeout"];
    }
  ): InternalRequestConfig {
    return prepareRequest(method, url, {
      ...(options?.params !== undefined ? { params: options.params } : {}),
      ...(options?.query !== undefined ? { query: options.query } : {}),
      ...(options?.headers !== undefined ? { headers: options.headers } : {}),
      ...(options?.signal !== undefined ? { signal: options.signal } : {}),
      ...(options?.timeout !== undefined ? { timeout: options.timeout } : {}),
      ...(body !== undefined ? { body } : {}),
    });
  }

  const client: PureqClient = {
    use(middleware: Middleware): PureqClient {
      return createClient({
        ...baseOptions,
        middlewares: [...commonMiddlewares, middleware],
      });
    },

    useRequestInterceptor(interceptor, options) {
      const entry: InterceptorEntry<RequestInterceptor> = {
        handler: interceptor,
        ...(options?.priority !== undefined ? { priority: options.priority } : {}),
        ...(options?.name !== undefined ? { name: options.name } : {}),
      };
      return createClient({
        ...baseOptions,
        requestInterceptors: [...(baseOptions.requestInterceptors ?? []), entry],
      });
    },

    useResponseInterceptor(interceptor, options) {
      const entry: InterceptorEntry<ResponseInterceptor> = {
        handler: interceptor,
        ...(options?.priority !== undefined ? { priority: options.priority } : {}),
        ...(options?.name !== undefined ? { name: options.name } : {}),
      };
      return createClient({
        ...baseOptions,
        responseInterceptors: [...(baseOptions.responseInterceptors ?? []), entry],
      });
    },

    request(config): Promise<HttpResponse> {
      return run(prepareRequest(config.method, config.url, config));
    },

    requestResult(config): Promise<HttpResult> {
      return runResult(prepareRequest(config.method, config.url, config));
    },

    requestJson(config) {
      const req = prepareRequest(config.method, config.url, config);
      return toJson(runResult(req), req);
    },

    requestJsonResult(config) {
      const req = prepareRequest(config.method, config.url, config);
      return toJsonResult(runResult(req), req);
    },

    get(url, options) {
      return run(prepareRequest("GET", url, options));
    },

    getResult(url, options) {
      return runResult(prepareRequest("GET", url, options));
    },

    getJson(url, options) {
      const req = prepareRequest("GET", url, options);
      return toJson(runResult(req), req);
    },

    getJsonResult(url, options) {
      const req = prepareRequest("GET", url, options);
      return toJsonResult(runResult(req), req);
    },

    post(url, body, options) {
      return run(prepareBodyRequest("POST", url, body, options));
    },

    postResult(url, body, options) {
      return runResult(prepareBodyRequest("POST", url, body, options));
    },

    postJson(url, body, options) {
      const req = prepareBodyRequest("POST", url, body, options);
      return toJson(runResult(req), req);
    },

    postJsonResult(url, body, options) {
      const req = prepareBodyRequest("POST", url, body, options);
      return toJsonResult(runResult(req), req);
    },

    put(url, body, options) {
      return run(prepareBodyRequest("PUT", url, body, options));
    },

    putResult(url, body, options) {
      return runResult(prepareBodyRequest("PUT", url, body, options));
    },

    patch(url, body, options) {
      return run(prepareBodyRequest("PATCH", url, body, options));
    },

    patchResult(url, body, options) {
      return runResult(prepareBodyRequest("PATCH", url, body, options));
    },

    delete(url, options) {
      return run(prepareRequest("DELETE", url, options));
    },

    deleteResult(url, options) {
      return runResult(prepareRequest("DELETE", url, options));
    },

    fetch(url, init) {
      return run(prepareFetchRequest(url, init));
    },

    fetchResult(url, init) {
      return runResult(prepareFetchRequest(url, init));
    },

    fetchJson(url, init) {
      const req = prepareFetchRequest(url, init);
      return toJson(runResult(req), req);
    },
  };

  return client;
}
