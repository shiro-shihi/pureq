import { err, ok } from "../result/result.js";
import { createValidationError, guardTimeoutError, VALIDATION_ERROR_CODES, } from "../errors/validation-error.js";
const TIMEOUT_ERROR_CODE = "PUREQ_VALIDATION_GUARD_TIMEOUT";
const createTimeoutError = (name, timeoutMs) => {
    const error = new Error(`Guard \"${name}\" timed out`);
    error.name = TIMEOUT_ERROR_CODE;
    return error;
};
const withGuardTimeout = async (outcome, name, timeoutMs, signal) => {
    if (!timeoutMs || timeoutMs <= 0) {
        if (signal?.aborted) {
            return Promise.reject(createTimeoutError(name, 0));
        }
        return outcome;
    }
    let timer;
    const timeoutPromise = new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
            reject(createTimeoutError(name, timeoutMs));
        }, timeoutMs);
    });
    const abortPromise = signal
        ? new Promise((_resolve, reject) => {
            if (signal.aborted) {
                reject(createTimeoutError(name, timeoutMs));
                return;
            }
            const onAbort = () => {
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
    }
    finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
};
const toValidationError = (name, cause) => createValidationError({
    code: VALIDATION_ERROR_CODES.INTERNAL_GUARD_EXCEPTION,
    message: `Guard "${name}" failed with an exception`,
    path: "/",
    cause: cause instanceof Error ? cause.message : String(cause),
});
const toFailedGuardResult = (name) => err(createValidationError({
    code: VALIDATION_ERROR_CODES.GUARDRAIL_FAILED,
    message: `Guard "${name}" returned false`,
    path: "/",
}));
const normalizeGuardValue = async (value, name, options, outcome) => {
    try {
        const resolved = await withGuardTimeout(Promise.resolve(outcome), name, options.timeoutMs, options.signal);
        if (typeof resolved === "boolean") {
            return resolved ? ok(value) : toFailedGuardResult(name);
        }
        return resolved;
    }
    catch (cause) {
        if (cause instanceof Error && cause.name === TIMEOUT_ERROR_CODE) {
            return err(guardTimeoutError({
                name,
                timeoutMs: options.timeoutMs ?? 0,
            }));
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
export const createGuard = (fn, nameOrOptions = "guard") => {
    const options = typeof nameOrOptions === "string"
        ? { name: nameOrOptions }
        : nameOrOptions;
    const name = options.name ?? "guard";
    return (value) => {
        try {
            const result = fn(value);
            if (result instanceof Promise) {
                return normalizeGuardValue(value, name, options, result);
            }
            if (typeof result === "boolean") {
                return result ? ok(value) : toFailedGuardResult(name);
            }
            return result;
        }
        catch (e) {
            return err(toValidationError(name, e));
        }
    };
};
