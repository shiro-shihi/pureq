export type Ok<T> = {
    ok: true;
    value: T;
};
export type Err<E> = {
    ok: false;
    error: E;
};
export type Result<T, E> = Ok<T> | Err<E>;
export declare const ok: <T>(value: T) => Ok<T>;
export declare const err: <E>(error: E) => Err<E>;
export declare const isOk: <T, E>(value: Result<T, E>) => value is Ok<T>;
export declare const isErr: <T, E>(value: Result<T, E>) => value is Err<E>;
export declare const map: <T, E, U>(value: Result<T, E>, mapper: (input: T) => U) => Result<U, E>;
export declare const mapError: <T, E, U>(value: Result<T, E>, mapper: (input: E) => U) => Result<T, U>;
export declare const combine: <T, E>(values: readonly Result<T, E>[]) => Result<T[], E[]>;
export declare const pipe: <T, E>(initial: Result<T, E>, ...steps: Array<(value: T) => Result<T, E>>) => Result<T, E>;
/**
 * Asynchronous version of pipe that can handle steps returning Promise<Result>.
 * Useful for guards with async validation functions.
 * Short-circuits on first failure.
 *
 * @param initial - The initial Result
 * @param steps - Array of functions that can be sync or async
 * @returns Promise<Result> after applying all steps or short-circuiting on first error
 */
export declare const pipeAsync: <T, E>(initial: Result<T, E>, ...steps: Array<(value: T) => Result<T, E> | Promise<Result<T, E>>>) => Promise<Result<T, E>>;
