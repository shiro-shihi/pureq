import type { ValidationPolicy } from "./types.js";

const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const sanitizeRecord = (source: Record<string, unknown>): Record<string, unknown> => {
  const safe: Record<string, unknown> = Object.create(null);

  for (const [key, value] of Object.entries(source)) {
    if (FORBIDDEN_OBJECT_KEYS.has(key)) {
      continue;
    }

    safe[key] = value;
  }

  return safe;
};

export const DEFAULT_VALIDATION_POLICY: Required<ValidationPolicy> = {
  redact: "none",
  pii: false,
  scope: [],
  guardrails: [],
  onDenied: "error",
};

const dedupe = (items: readonly string[]): string[] => {
  return [...new Set(items)];
};

const cloneGuardrails = (
  guardrails: readonly NonNullable<ValidationPolicy["guardrails"]>[number][],
): NonNullable<ValidationPolicy["guardrails"]> => {
  return guardrails.map((rule) => ({
    ...rule,
    ...(rule.params ? { params: sanitizeRecord(rule.params) } : {}),
  }));
};

export const normalizeValidationPolicy = (policy: ValidationPolicy = {}): Required<ValidationPolicy> => {
  return {
    redact: policy.redact ?? DEFAULT_VALIDATION_POLICY.redact,
    pii: Boolean(policy.pii),
    scope: dedupe([...(policy.scope ?? [])]),
    guardrails: cloneGuardrails(policy.guardrails ?? []),
    onDenied: policy.onDenied ?? DEFAULT_VALIDATION_POLICY.onDenied,
  };
};

export const cloneValidationPolicy = (policy: ValidationPolicy): Required<ValidationPolicy> => {
  return normalizeValidationPolicy(policy);
};

export const mergeValidationPolicy = (
  base: ValidationPolicy,
  next: ValidationPolicy,
): ValidationPolicy => {
  const normalizedBase = normalizeValidationPolicy(base);
  const normalizedNext = normalizeValidationPolicy(next);
  const mergedScope = dedupe([...normalizedBase.scope, ...normalizedNext.scope]);
  const mergedGuardrails = cloneGuardrails([
    ...normalizedBase.guardrails,
    ...normalizedNext.guardrails,
  ]);
  const redact = normalizedNext.redact ?? normalizedBase.redact ?? DEFAULT_VALIDATION_POLICY.redact;
  const onDenied = normalizedNext.onDenied ?? normalizedBase.onDenied ?? DEFAULT_VALIDATION_POLICY.onDenied;

  return {
    redact,
    pii: Boolean(normalizedBase.pii) || Boolean(normalizedNext.pii),
    scope: mergedScope,
    guardrails: mergedGuardrails,
    onDenied,
  };
};
