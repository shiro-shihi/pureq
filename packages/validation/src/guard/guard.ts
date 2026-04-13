import { type Result, err, ok } from "../result/result.js";
import {
  type ValidationError,
  createValidationError,
  guardTimeoutError,
  VALIDATION_ERROR_CODES,
} from "../errors/validation-error.js";

/**
 * Guard function that validates a value.
 * Can return a boolean, Result, Promise<boolean>, or Promise<Result>.
 * - true/ok() passes validation and returns original value
 * - false/err() fails validation and returns ValidationError
 * - Exceptions are normalized to ValidationError with INTERNAL_GUARD_EXCEPTION code
 */
export type GuardFunction<T> =
  | ((value: T) => boolean | Result<T, ValidationError>)
  | ((value: T) => Promise<boolean | Result<T, ValidationError>>);

/**
 * Guard executor that can be used with pipe or pipeAsync.
 * Takes a value and returns Result or Promise<Result> depending on whether the guard is async.
 */
export type GuardExecutor<T> = (value: T) => Result<T, ValidationError> | Promise<Result<T, ValidationError>>;

export type GuardOptions = {
  name?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
};

const TIMEOUT_ERROR_CODE = "PUREQ_VALIDATION_GUARD_TIMEOUT";

const createTimeoutError = (name: string, timeoutMs: number): Error => {
  const error = new Error(`Guard \"${name}\" timed out`);
  error.name = TIMEOUT_ERROR_CODE;
  return error;
};

const withGuardTimeout = async <T>(
  outcome: Promise<T>,
  name: string,
  timeoutMs?: number,
  signal?: AbortSignal,
): Promise<T> => {
  if (!timeoutMs || timeoutMs <= 0) {
    if (signal?.aborted) {
      return Promise.reject(createTimeoutError(name, 0));
    }
    return outcome;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(createTimeoutError(name, timeoutMs));
    }, timeoutMs);
  });

  const abortPromise = signal
    ? new Promise<never>((_resolve, reject) => {
        if (signal.aborted) {
          reject(createTimeoutError(name, timeoutMs));
          return;
        }

        const onAbort = (): void => {
          signal.removeEventListener("abort", onAbort);
          reject(createTimeoutError(name, timeoutMs));
        };

        signal.addEventListener("abort", onAbort, { once: true });
      })
    : undefined;

  try {
    if (abortPromise) {
      return await Promise.race([outcome, timeoutPromise, abortPromise]);
    }

    return await Promise.race([outcome, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const toValidationError = (name: string, cause: unknown): ValidationError =>
  createValidationError({
    code: VALIDATION_ERROR_CODES.INTERNAL_GUARD_EXCEPTION,
    message: `Guard "${name}" failed with an exception`,
    path: "/",
    cause: cause instanceof Error ? cause.message : String(cause),
  });

const toFailedGuardResult = <T>(name: string): Result<T, ValidationError> =>
  err(
    createValidationError({
      code: VALIDATION_ERROR_CODES.GUARDRAIL_FAILED,
      message: `Guard "${name}" returned false`,
      path: "/",
    })
  );

const normalizeGuardValue = async <T>(
  value: T,
  name: string,
  options: GuardOptions,
  outcome: boolean | Result<T, ValidationError> | Promise<boolean | Result<T, ValidationError>>,
): Promise<Result<T, ValidationError>> => {
  try {
    const resolved = await withGuardTimeout(
      Promise.resolve(outcome),
      name,
      options.timeoutMs,
      options.signal,
    );

    if (typeof resolved === "boolean") {
      return resolved ? ok(value) : toFailedGuardResult<T>(name);
    }

    return resolved;
  } catch (cause) {
    if (cause instanceof Error && cause.name === TIMEOUT_ERROR_CODE) {
      return err(
        guardTimeoutError({
          name,
          timeoutMs: options.timeoutMs ?? 0,
        }),
      );
    }

    return err(toValidationError(name, cause));
  }
};

/**
 * Creates a guard executor from a guard function.
 * Wraps the function to handle exceptions and normalize return values.
 * 
 * @param fn - The guard validation function
 * @param name - Optional name for error messages
 * @returns A guard executor function for use in pipe/pipeAsync
 */
export const createGuard = <T>(fn: GuardFunction<T>, nameOrOptions: string | GuardOptions = "guard"): GuardExecutor<T> => {
  const options: GuardOptions =
    typeof nameOrOptions === "string"
      ? { name: nameOrOptions }
      : nameOrOptions;

  const name = options.name ?? "guard";

  return (value: T): Result<T, ValidationError> | Promise<Result<T, ValidationError>> => {
    try {
      const result = fn(value);

      if (result instanceof Promise) {
        return normalizeGuardValue(value, name, options, result);
      }

      if (typeof result === "boolean") {
        return result ? ok(value) : toFailedGuardResult<T>(name);
      }

      return result;
    } catch (e) {
      return err(toValidationError(name, e));
    }
  };
};
