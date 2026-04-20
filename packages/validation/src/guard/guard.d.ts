import { type Result } from "../result/result.js";
import { type ValidationError } from "../errors/validation-error.js";
/**
 * Guard function that validates a value.
 * Can return a boolean, Result, Promise<boolean>, or Promise<Result>.
 * - true/ok() passes validation and returns original value
 * - false/err() fails validation and returns ValidationError
 * - Exceptions are normalized to ValidationError with INTERNAL_GUARD_EXCEPTION code
 */
export type GuardFunction<T> = ((value: T) => boolean | Result<T, ValidationError>) | ((value: T) => Promise<boolean | Result<T, ValidationError>>);
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
/**
 * Creates a guard executor from a guard function.
 * Wraps the function to handle exceptions and normalize return values.
 *
 * @param fn - The guard validation function
 * @param name - Optional name for error messages
 * @returns A guard executor function for use in pipe/pipeAsync
 */
export declare const createGuard: <T>(fn: GuardFunction<T>, nameOrOptions?: string | GuardOptions) => GuardExecutor<T>;
