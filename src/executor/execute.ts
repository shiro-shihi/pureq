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
      finalUrl = finalUrl.replaceAll(`:${key}`, encodeURIComponent(value));
    }
  }

  // Detect any unreplaced path parameter placeholders
  const unreplaced = finalUrl.match(/:([a-zA-Z_]\w*)/g);
  if (unreplaced) {
    throw new Error(`pureq: unresolved path parameters: ${unreplaced.join(", ")}`);
  }

  // Use URL API for robust query parameter handling
  // We use a dummy base for relative URLs to allow URL parsing.
  const isAbsolute = /^[a-z][a-z\d+.-]*:/i.test(finalUrl) || finalUrl.startsWith("//");
  const urlObj = isAbsolute ? new URL(finalUrl) : new URL(finalUrl, "http://localhost");

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        for (const v of value) urlObj.searchParams.append(key, String(v));
      } else {
        urlObj.searchParams.append(key, String(value));
      }
    }
  }

  if (isAbsolute) {
    return urlObj.toString();
  }

  // For relative URLs, return path + search + hash
  const relative = urlObj.pathname + urlObj.search + urlObj.hash;
  if (finalUrl.startsWith("/")) {
    return relative;
  }

  return relative.startsWith("/") ? relative.slice(1) : relative;
}

const defaultBodySerializer: BodySerializer = jsonBodySerializer;

export interface ExecuteOptions {
  readonly adapter?: HttpAdapter;
  readonly bodySerializer?: BodySerializer;
}

function buildManagedSignal(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number | undefined
): { signal: AbortSignal; cleanup: () => void; isTimeoutTriggered: () => boolean } {
  const signals: AbortSignal[] = [];
  let timeoutTriggered = false;

  if (externalSignal) {
    signals.push(externalSignal);
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timeoutSignal: AbortSignal | undefined;
  let timeoutController: AbortController | undefined;
  const onTimeoutAbort = () => {
    timeoutTriggered = true;
  };

  if (timeoutMs !== undefined && timeoutMs > 0) {
    // Note: AbortSignal.timeout(ms) is preferred in modern environments.
    // However, to keep better error messaging and cleanup control, we can also use it via AbortSignal.any.
    timeoutSignal = (AbortSignal as any).timeout
      ? (AbortSignal as any).timeout(timeoutMs)
      : undefined;

    if (timeoutSignal) {
      if (timeoutSignal.aborted) {
        timeoutTriggered = true;
      } else {
        timeoutSignal.addEventListener("abort", onTimeoutAbort, { once: true });
      }
      signals.push(timeoutSignal);
    } else {
      // Fallback for older environments if needed
      const controller = new AbortController();
      timeoutController = controller;
      timeoutId = setTimeout(() => {
        timeoutTriggered = true;
        controller.abort(new Error(`pureq: request timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      signals.push(controller.signal);
    }
  }

  const cleanupTimeoutArtifacts = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (timeoutSignal) {
      timeoutSignal.removeEventListener("abort", onTimeoutAbort);
    }
    if (timeoutController?.signal.aborted) {
      timeoutTriggered = true;
    }
  };

  if (signals.length === 0) {
    return {
      signal: new AbortController().signal,
      cleanup: cleanupTimeoutArtifacts,
      isTimeoutTriggered: () => timeoutTriggered,
    };
  }

  if (signals.length === 1) {
    return {
      signal: signals[0]!,
      cleanup: cleanupTimeoutArtifacts,
      isTimeoutTriggered: () => timeoutTriggered,
    };
  }

  const combinedSignal = (AbortSignal as any).any
    ? (AbortSignal as any).any(signals)
    : undefined;

  if (combinedSignal) {
    return {
      signal: combinedSignal,
      cleanup: cleanupTimeoutArtifacts,
      isTimeoutTriggered: () => timeoutTriggered,
    };
  }

  // Legacy manual polyfill for AbortSignal.any if it doesn't exist
  const controller = new AbortController();
  const onAbort = (e: Event) => {
    controller.abort((e.target as AbortSignal).reason);
    cleanup();
  };

  const cleanup = () => {
    cleanupTimeoutArtifacts();
    for (const s of signals) {
      s.removeEventListener("abort", onAbort);
    }
  };

  for (const s of signals) {
    if (s.aborted) {
      controller.abort(s.reason);
      cleanup();
      break;
    }
    s.addEventListener("abort", onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup,
    isTimeoutTriggered: () => timeoutTriggered,
  };
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
  const { signal, cleanup, isTimeoutTriggered } = buildManagedSignal(req.signal, req.timeout);

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
    const isNativeTimeoutError =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.message.includes("request timeout"));

    if (req.timeout !== undefined && req.timeout > 0 && (isTimeoutTriggered() || isNativeTimeoutError)) {
      throw new Error(`pureq: request timeout after ${req.timeout}ms`);
    }

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
