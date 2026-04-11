import type { TransportEvent } from "../types/events";
import type { OpenTelemetryLikeAttributes } from "./otelMapping";
import { mapTransportEventToOtelAttributes } from "./otelMapping";

/**
 * Maps a transport event to standard HTTP OpenTelemetry semantic conventions.
 * @see https://opentelemetry.io/docs/specs/semconv/http/http-spans/
 */
export function mapToStandardHttpAttributes(
  event: TransportEvent
): OpenTelemetryLikeAttributes {
  const base = mapTransportEventToOtelAttributes(event);
  const attributes: Record<string, string | number | boolean> = {
    ...base,
    "http.method": event.method,
    "http.url": event.url,
  };

  if (event.status !== undefined) {
    attributes["http.status_code"] = event.status;
  }

  // Optionally extract host/scheme if URL is valid
  try {
    const urlObj = new URL(event.url);
    attributes["http.scheme"] = urlObj.protocol.replace(":", "");
    attributes["http.host"] = urlObj.host;
    attributes["net.peer.name"] = urlObj.hostname;
    attributes["net.peer.port"] = urlObj.port ? parseInt(urlObj.port, 10) : (urlObj.protocol === "https:" ? 443 : 80);
  } catch {
    // Ignore invalid URLs
  }

  return attributes;
}

/**
 * Maps a transport event to AWS X-Ray compatible semantic conventions.
 */
export function mapToAwsSemanticConventions(
  event: TransportEvent
): OpenTelemetryLikeAttributes {
  const standard = mapToStandardHttpAttributes(event);
  
  const awsAttributes: Record<string, string | number | boolean> = {
    ...standard,
    "aws.service": "pureq-client",
  };

  if (event.status !== undefined) {
    if (event.status >= 500) awsAttributes["aws.is_fault"] = true;
    else if (event.status >= 400) awsAttributes["aws.is_error"] = true;
  } else if (event.errorKind !== undefined) {
    awsAttributes["aws.is_fault"] = true;
  }

  return awsAttributes;
}

/**
 * Maps a transport event to GCP Cloud Trace compatible semantic conventions.
 */
export function mapToGcpSemanticConventions(
  event: TransportEvent
): OpenTelemetryLikeAttributes {
  const standard = mapToStandardHttpAttributes(event);
  
  const gcpAttributes: Record<string, string | number | boolean> = {
    ...standard,
  };

  // GCP Cloud Trace often looks for specific agent identifiers and status mappings
  if (event.status !== undefined) {
    gcpAttributes["/http/status_code"] = event.status;
  }
  gcpAttributes["/http/url"] = event.url;
  gcpAttributes["/http/method"] = event.method;
  gcpAttributes["/agent"] = "pureq";

  return gcpAttributes;
}
