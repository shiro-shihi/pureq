import type { BodySerializer, HttpAdapter, RequestConfig } from "../types/http";
import { HttpResponse } from "../response/response";
import { err, ok, toPureqError, type HttpResult } from "../types/result";
import { jsonBodySerializer } from "../serializers/jsonBodySerializer";

/**
 * Builds the effective URL with path parameter replacement and query string expansion.
 * Pure function: No side effects.
 */
function buildFullURL(
  url: string,
  params?: Readonly<Record<string, string>>,
  query?: RequestConfig["query"]
): string {
  let finalUrl = url;

  // Replace path parameters (e.g., /users/:id)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      // Use replaceAll to handle multiple occurrences of the same parameter
      finalUrl = finalUrl.replaceAll(`:${key}`, encodeURIComponent(value));
    }
  }

  // Detect any unreplaced path parameter placeholders
  const unreplaced = finalUrl.match(/:([a-zA-Z_]\w*)/g);
  if (unreplaced) {
    throw new Error(`pureq: unresolved path parameters: ${unreplaced.join(", ")}`);
  }

  // Handle query parameters
  if (query) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        value.forEach((v) => searchParams.append(key, String(v)));
      } else {
        searchParams.append(key, String(value));
      }
    }

    const queryString = searchParams.toString();
    if (queryString) {
      finalUrl += (finalUrl.includes("?") ? "&" : "?") + queryString;
    }
  }

  return finalUrl;
}

const defaultBodySerializer: BodySerializer = jsonBodySerializer;

export interface ExecuteOptions {
  readonly adapter?: HttpAdapter;
  readonly bodySerializer?: BodySerializer;
}

function buildManagedSignal(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number | undefined
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const abortFromExternal = () => {
    controller.abort(externalSignal?.reason ?? new DOMException("Aborted", "AbortError"));
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      abortFromExternal();
    } else {
      externalSignal.addEventListener("abort", abortFromExternal, { once: true });
    }
  }

  if (timeoutMs !== undefined && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      controller.abort(new Error(`pureq: request timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  }

  const cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (externalSignal) {
      externalSignal.removeEventListener("abort", abortFromExternal);
    }
  };

  return { signal: controller.signal, cleanup };
}

/**
 * Performs actual HTTP execution using the global fetch API.
 * This is the ONLY file allowed to have HTTP-related side effects.
 */
export async function execute(req: RequestConfig, options: ExecuteOptions = {}): Promise<HttpResponse> {
  const adapter = options.adapter ?? fetch;
  const serializer = options.bodySerializer ?? defaultBodySerializer;
  const fullUrl = buildFullURL(req.url, req.params, req.query);
  const { payload, contentType } = serializer.serialize(req.body);
  const { signal, cleanup } = buildManagedSignal(req.signal, req.timeout);

  const init: RequestInit = {
    method: req.method,
    headers: req.headers ?? {},
    body: req.method !== "GET" && req.method !== "HEAD" ? payload : null,
    signal,
  };

  // Provide default JSON headers only when body was JSON-encoded by pureq.
  // Use case-insensitive check to avoid duplicate Content-Type headers.
  const hasContentType = req.headers &&
    Object.keys(req.headers).some((k) => k.toLowerCase() === "content-type");
  if (contentType && !hasContentType) {
    init.headers = {
      ...req.headers,
      "Content-Type": contentType,
    };
  }

  try {
    const res = await adapter(fullUrl, init);
    cleanup();
    return new HttpResponse(res);
  } catch (error) {
    cleanup();
    // These are execution errors (network, DNS, timeout etc.), NOT status errors.
    throw error;
  }
}

/**
 * Non-throwing execution API that always returns a Result.
 * HTTP status errors are represented by HttpResponse with ok=false.
 * Transport/runtime failures are represented by Err(PureqError).
 */
export async function executeResult(req: RequestConfig, options: ExecuteOptions = {}): Promise<HttpResult> {
  try {
    const response = await execute(req, options);
    return ok(response);
  } catch (cause) {
    return err(toPureqError(cause));
  }
}
