/**
 * Shared utility for appending policy trace entries to the internal
 * request metadata. The _meta object is intentionally mutable to allow
 * trace accumulation as the request traverses the middleware pipeline.
 *
 * IMPORTANT: When forking requests (e.g. hedge middleware), callers
 * must deep-copy _meta first to prevent cross-fork trace pollution.
 */

import type { RequestConfig } from "../types/http";
import type { PolicyTraceEntry } from "../types/events";

export function appendPolicyTrace(req: RequestConfig, entry: PolicyTraceEntry): void {
  const mutableReq = req as RequestConfig & { _meta?: Record<string, unknown> };
  const currentMeta = mutableReq._meta ?? {};

  const existingTrace = Array.isArray(currentMeta.policyTrace)
    ? (currentMeta.policyTrace as readonly PolicyTraceEntry[])
    : [];

  currentMeta.policyTrace = [...existingTrace, entry];
  mutableReq._meta = currentMeta;
}

/**
 * Creates a deep copy of the internal _meta object so that forked
 * request paths (e.g. primary vs hedge) do not share mutable state.
 */
export function deepCopyMeta(
  req: RequestConfig
): Record<string, unknown> {
  const meta = (req as { _meta?: Record<string, unknown> })._meta;
  if (!meta) {
    return {};
  }

  return {
    ...meta,
    ...(Array.isArray(meta.policyTrace)
      ? { policyTrace: [...meta.policyTrace] }
      : {}),
  };
}
