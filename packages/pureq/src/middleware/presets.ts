import type { Middleware } from "../types/http";
import { circuitBreaker, type CircuitBreakerOptions } from "./circuitBreaker";
import { dedupe, type DedupeOptions } from "./dedupe";
import { retry, type RetryOptions } from "./retry";
import { idempotencyKey, type IdempotencyKeyOptions } from "./idempotencyKey";
import { defaultTimeout } from "./defaultTimeout";

export interface ResilientPresetOptions {
  readonly dedupe?: false | DedupeOptions;
  readonly retry?: RetryOptions;
  readonly circuitBreaker?: CircuitBreakerOptions;
  readonly idempotencyKey?: false | IdempotencyKeyOptions;
}

export interface PresetProfileOptions extends ResilientPresetOptions {
  readonly requestTimeoutMs?: number;
}

function mergeRetry(defaults: RetryOptions, override?: RetryOptions): RetryOptions {
  if (!override) {
    return defaults;
  }
  return {
    ...defaults,
    ...override,
  };
}

function mergeCircuitBreaker(
  defaults: CircuitBreakerOptions,
  override?: CircuitBreakerOptions
): CircuitBreakerOptions {
  if (!override) {
    return defaults;
  }
  return {
    ...defaults,
    ...override,
  };
}

/**
 * Production-ready middleware stack preset for fetch/axios replacement use cases.
 */
export function resilientPreset(options: ResilientPresetOptions = {}): readonly Middleware[] {
  const stack: Middleware[] = [];

  if (options.dedupe !== false) {
    stack.push(dedupe(options.dedupe));
  }

  if (options.idempotencyKey !== false) {
    stack.push(idempotencyKey(options.idempotencyKey));
  }

  stack.push(
    retry(
      options.retry ?? {
        maxRetries: 2,
        delay: 200,
        backoff: true,
        retryOnStatus: [429, 500, 502, 503, 504],
      }
    )
  );

  stack.push(
    circuitBreaker(
      options.circuitBreaker ?? {
        failureThreshold: 5,
        successThreshold: 1,
        cooldownMs: 30_000,
      }
    )
  );

  return stack;
}

/**
 * Frontend-focused preset with conservative retries for user-facing responsiveness.
 */
export function frontendPreset(options: PresetProfileOptions = {}): readonly Middleware[] {
  const timeoutMs = options.requestTimeoutMs ?? 5_000;

  return [
    defaultTimeout(timeoutMs),
    ...resilientPreset({
    ...options,
    dedupe: options.dedupe ?? { methods: ["GET", "HEAD"] },
    retry: mergeRetry(
      {
        maxRetries: 1,
        delay: 150,
        backoff: true,
        retryOnStatus: [429, 500, 502, 503, 504],
      },
      options.retry
    ),
    circuitBreaker: mergeCircuitBreaker(
      {
        failureThreshold: 4,
        successThreshold: 1,
        cooldownMs: 10_000,
      },
      options.circuitBreaker
    ),
    }),
  ];
}

/**
 * BFF-focused preset balancing latency and upstream stability.
 */
export function bffPreset(options: PresetProfileOptions = {}): readonly Middleware[] {
  const timeoutMs = options.requestTimeoutMs ?? 3_000;

  return [
    defaultTimeout(timeoutMs),
    ...resilientPreset({
    ...options,
    dedupe: options.dedupe ?? { methods: ["GET", "HEAD"] },
    idempotencyKey: options.idempotencyKey ?? { onlyIfBodyPresent: true },
    retry: mergeRetry(
      {
        maxRetries: 2,
        delay: 200,
        backoff: true,
        retryOnStatus: [429, 500, 502, 503, 504],
      },
      options.retry
    ),
    circuitBreaker: mergeCircuitBreaker(
      {
        failureThreshold: 5,
        successThreshold: 1,
        cooldownMs: 20_000,
      },
      options.circuitBreaker
    ),
    }),
  ];
}

/**
 * Backend-focused preset prioritizing dependency resilience under sustained load.
 */
export function backendPreset(options: PresetProfileOptions = {}): readonly Middleware[] {
  const timeoutMs = options.requestTimeoutMs ?? 2_500;

  return [
    defaultTimeout(timeoutMs),
    ...resilientPreset({
    ...options,
    dedupe: options.dedupe ?? false,
    idempotencyKey: options.idempotencyKey ?? { onlyIfBodyPresent: true },
    retry: mergeRetry(
      {
        maxRetries: 3,
        delay: 250,
        backoff: true,
        retryOnStatus: [408, 425, 429, 500, 502, 503, 504],
      },
      options.retry
    ),
    circuitBreaker: mergeCircuitBreaker(
      {
        failureThreshold: 6,
        successThreshold: 2,
        cooldownMs: 30_000,
      },
      options.circuitBreaker
    ),
    }),
  ];
}
