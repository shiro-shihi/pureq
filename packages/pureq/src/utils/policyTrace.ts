import type { RequestConfig } from "../types/http";
import type { PolicyTraceEntry } from "../types/events";

export function appendPolicyTrace(req: RequestConfig, entry: PolicyTraceEntry): void {
  const mutableReq = req as any;
  const currentMeta = mutableReq.meta ?? {};

  const existingTrace = Array.isArray(currentMeta.policyTrace)
    ? (currentMeta.policyTrace as readonly PolicyTraceEntry[])
    : [];

  currentMeta.policyTrace = [...existingTrace, entry];
  mutableReq.meta = currentMeta;
}

export function getPolicyTrace(req: RequestConfig): readonly PolicyTraceEntry[] {
  const meta = (req as any).meta;
  if (!meta || !Array.isArray(meta.policyTrace)) {
    return [];
  }
  return meta.policyTrace;
}

/**
 * Explains the history of decisions made for this request in a human-readable format.
 * Essential for "Why was this retried?" or "Why was the circuit opened?" questions.
 */
export function explainPolicyTrace(req: RequestConfig): string {
  const trace = getPolicyTrace(req);
  if (trace.length === 0) {
    return "No policy decisions recorded.";
  }

  return trace
    .map((e) => {
      const time = new Date(e.at).toISOString();
      const details = Object.entries(e)
        .filter(([k]) => k !== "policy" && k !== "at" && k !== "decision")
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(", ");
      return `[${time}] ${e.policy.toUpperCase()}: ${e.decision.toUpperCase()} (${details})`;
    })
    .join("\n");
}

/**
 * Creates a deep copy of the internal meta object so that forked
 * request paths (e.g. primary vs hedge) do not share mutable state.
 */
export function deepCopyMeta(
  req: RequestConfig
): Record<string, unknown> {
  const meta = (req as any).meta;
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
