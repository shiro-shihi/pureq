export const ok = (value) => ({ ok: true, value });
export const err = (error) => ({ ok: false, error });
export const isOk = (value) => value.ok;
export const isErr = (value) => !value.ok;
export const map = (value, mapper) => {
    if (isErr(value)) {
        return value;
    }
    return ok(mapper(value.value));
};
export const mapError = (value, mapper) => {
    if (isOk(value)) {
        return value;
    }
    return err(mapper(value.error));
};
export const combine = (values) => {
    const collectedValues = [];
    const collectedErrors = [];
    for (const value of values) {
        if (isOk(value)) {
            collectedValues.push(value.value);
            continue;
        }
        collectedErrors.push(value.error);
    }
    if (collectedErrors.length > 0) {
        return err(collectedErrors);
    }
    return ok(collectedValues);
};
export const pipe = (initial, ...steps) => {
    if (isErr(initial)) {
        return initial;
    }
    let current = initial;
    for (const step of steps) {
        if (isErr(current)) {
            return current;
        }
        current = step(current.value);
    }
    return current;
};
/**
 * Asynchronous version of pipe that can handle steps returning Promise<Result>.
 * Useful for guards with async validation functions.
 * Short-circuits on first failure.
 *
 * @param initial - The initial Result
 * @param steps - Array of functions that can be sync or async
 * @returns Promise<Result> after applying all steps or short-circuiting on first error
 */
export const pipeAsync = async (initial, ...steps) => {
    if (isErr(initial)) {
        return initial;
    }
    let current = initial;
    for (const step of steps) {
        if (isErr(current)) {
            return current;
        }
        const result = step(current.value);
        current = result instanceof Promise ? await result : result;
    }
    return current;
};
