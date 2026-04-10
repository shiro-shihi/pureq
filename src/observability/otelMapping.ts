import type { TransportEvent } from "../types/events";

export interface OpenTelemetryLikeAttributes {
  readonly [key: string]: string | number | boolean;
}

/**
 * Maps a transport event to OpenTelemetry-like attributes.
 *
 * SECURITY NOTE: The `url.full` attribute contains the raw URL which may include
 * sensitive query parameters (tokens, API keys). Use `redactUrlQueryParams()`
 * from the redaction module to sanitize URLs before exporting to telemetry backends.
 */
export function mapTransportEventToOtelAttributes(
  event: TransportEvent
): OpenTelemetryLikeAttributes {
  const attributes: Record<string, string | number | boolean> = {
    "http.request.method": event.method,
    "url.full": event.url,
    "pureq.phase": event.phase,
  };

  if (event.status !== undefined) {
    attributes["http.response.status_code"] = event.status;
  }

  if (event.durationMs !== undefined) {
    attributes["pureq.duration_ms"] = event.durationMs;
  }

  if (event.retryCount !== undefined) {
    attributes["pureq.retry_count"] = event.retryCount;
  }

  if (event.errorKind !== undefined) {
    attributes["pureq.error_kind"] = event.errorKind;
  }

  if (event.policyTrace !== undefined) {
    attributes["pureq.policy_trace_count"] = event.policyTrace.length;
  }

  return attributes;
}
