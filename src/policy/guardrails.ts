import type { Middleware } from "../types/http";

export interface PolicyMetadata {
  readonly name: string;
  readonly kind: "timeout" | "retry" | "hedge" | "cache" | "concurrency" | "validation" | "auth" | "fallback";
  readonly maxRetries?: number;
  readonly maxConcurrent?: number;
}

export type PolicyAwareMiddleware = Middleware & {
  readonly __pureqPolicy?: PolicyMetadata;
};

export function markPolicyMiddleware<T extends Middleware>(middleware: T, metadata: PolicyMetadata): T {
  Object.defineProperty(middleware, "__pureqPolicy", {
    value: metadata,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return middleware;
}

export function getPolicyMetadata(middleware: Middleware): PolicyMetadata | undefined {
  return (middleware as PolicyAwareMiddleware).__pureqPolicy;
}

export function validatePolicyGuardrails(middlewares: readonly Middleware[]): void {
  const policies = middlewares
    .map((middleware) => getPolicyMetadata(middleware))
    .filter((policy): policy is PolicyMetadata => policy !== undefined);

  const retryPolicies = policies.filter((policy) => policy.kind === "retry");
  if (retryPolicies.length > 1) {
    throw new Error("pureq: multiple retry policies are not allowed in one client");
  }

  const timeoutPolicies = policies.filter((policy) => policy.kind === "timeout");
  const hasDeadline = timeoutPolicies.some((policy) => policy.name === "deadline");
  const hasDefaultTimeout = timeoutPolicies.some((policy) => policy.name === "defaultTimeout");
  if (hasDeadline && hasDefaultTimeout) {
    throw new Error("pureq: use deadline or defaultTimeout, not both");
  }

  if (timeoutPolicies.length > 1) {
    throw new Error("pureq: do not combine multiple timeout policies in one client");
  }

  for (const policy of retryPolicies) {
    if (policy.maxRetries !== undefined && policy.maxRetries > 10) {
      throw new Error("pureq: retry maxRetries must be 10 or less");
    }
  }
}