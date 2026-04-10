import type { HttpResponse } from "../response/response";

export type Ok<T> = {
  readonly ok: true;
  readonly data: T;
};

export type Err<E> = {
  readonly ok: false;
  readonly error: E;
};

export type Result<T, E> = Ok<T> | Err<E>;

export type PureqErrorKind = "network" | "timeout" | "aborted" | "http" | "circuit-open" | "unknown";

export interface PureqErrorMetadata {
  readonly requestId?: string;
  readonly method?: string;
  readonly url?: string;
  readonly retryCount?: number;
  readonly rootCause?: string;
}

export interface PureqError {
  readonly kind: PureqErrorKind;
  readonly message: string;
  readonly cause: unknown;
  readonly status?: number;
  readonly statusText?: string;
  readonly metadata?: PureqErrorMetadata;
}

export type HttpResult = Result<HttpResponse, PureqError>;

export function ok<T>(data: T): Ok<T> {
  return { ok: true, data };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

function extractRetryCount(cause: unknown): number | undefined {
  if (typeof cause === "object" && cause !== null && "__pureqRetryCount" in cause) {
    const value = (cause as { __pureqRetryCount?: unknown }).__pureqRetryCount;
    return typeof value === "number" ? value : undefined;
  }
  return undefined;
}

function inferRootCause(cause: unknown): string {
  // DOMException extends Error, so a single instanceof Error check covers both.
  if (cause instanceof Error) {
    return cause.name;
  }
  return typeof cause;
}

export function toPureqError(cause: unknown, metadata: PureqErrorMetadata = {}): PureqError {
  const message = cause instanceof Error ? cause.message : String(cause);
  const isTypeErrorLike =
    cause instanceof TypeError ||
    (typeof cause === "object" &&
      cause !== null &&
      "name" in cause &&
      (cause as { name?: unknown }).name === "TypeError");
  const looksLikeNetworkMessage = /network|fetch|socket|econn|enotfound|timed out/i.test(message);
  const retryCount =
    metadata.retryCount !== undefined ? metadata.retryCount : extractRetryCount(cause);
  const rootCause =
    metadata.rootCause !== undefined ? metadata.rootCause : inferRootCause(cause);
  const normalizedMetadata: PureqErrorMetadata = {
    ...metadata,
    ...(retryCount !== undefined ? { retryCount } : {}),
    ...(rootCause !== undefined ? { rootCause } : {}),
  };

  if (cause instanceof Error && cause.message.includes("request timeout")) {
    return { kind: "timeout", message, cause, metadata: normalizedMetadata };
  }

  if (
    cause instanceof DOMException &&
    cause.name === "AbortError"
  ) {
    return { kind: "aborted", message, cause, metadata: normalizedMetadata };
  }

  if (isTypeErrorLike || looksLikeNetworkMessage) {
    return { kind: "network", message, cause, metadata: normalizedMetadata };
  }

  if (
    cause instanceof Error &&
    (cause.name === "PureqCircuitOpenError" ||
      message.includes("circuit breaker is open") ||
      message.includes("half-open probe in flight"))
  ) {
    return { kind: "circuit-open", message, cause, metadata: normalizedMetadata };
  }

  return { kind: "unknown", message, cause, metadata: normalizedMetadata };
}

export function httpErrorFromResponse(response: HttpResponse, metadata: PureqErrorMetadata = {}): PureqError {
  const base = `HTTP ${response.status}`;
  const detail = response.statusText ? ` ${response.statusText}` : "";

  return {
    kind: "http",
    message: `${base}${detail}`,
    cause: response,
    status: response.status,
    statusText: response.statusText,
    metadata,
  };
}
