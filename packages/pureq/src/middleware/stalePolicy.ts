export interface StalePolicyDecision {
  readonly ageMs: number;
  readonly isFresh: boolean;
  readonly canServeStaleOnError: boolean;
  readonly ttlMs: number;
  readonly staleIfErrorMs: number;
}

export function resolveStalePolicy(options: {
  readonly storedAt: number;
  readonly now: number;
  readonly ttlMs: number;
  readonly staleIfErrorMs: number;
}): StalePolicyDecision {
  const ageMs = Math.max(0, options.now - options.storedAt);
  const isFresh = ageMs <= options.ttlMs;
  const canServeStaleOnError = ageMs <= options.ttlMs + options.staleIfErrorMs;

  return {
    ageMs,
    isFresh,
    canServeStaleOnError,
    ttlMs: options.ttlMs,
    staleIfErrorMs: options.staleIfErrorMs,
  };
}
