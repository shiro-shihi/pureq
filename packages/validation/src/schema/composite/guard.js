import { cloneValidationPolicy, mergeValidationPolicy, normalizeValidationPolicy } from "../../policy/merge.js";
import { err, isOk, ok } from "../../result/result.js";
import { createGuard } from "../../guard/guard.js";
import { createValidationError, VALIDATION_ERROR_CODES } from "../../errors/validation-error.js";
/**
 * GuardSchema acts as both a PolicySchema and a callable GuardExecutor.
 * This allows it to be used in pipe() chains while still carrying metadata.
 */
export class GuardSchema {
    fn;
    nameOrOptions;
    metadata;
    constructor(fn, nameOrOptions = "guard", metadata = {}) {
        this.fn = fn;
        this.nameOrOptions = nameOrOptions;
        this.metadata = normalizeValidationPolicy(metadata);
    }
    policy(metadata) {
        return new GuardSchema(this.fn, this.nameOrOptions, mergeValidationPolicy(this.metadata, metadata));
    }
    /**
     * Implementation of PolicySchema.parse.
     * Returns a full ValidationResult with metadata.
     */
    parse(input, path = "/", context) {
        const executor = createGuard(this.fn, this.nameOrOptions);
        // In sync parse, we must handle async guards by returning an error
        const result = executor(input);
        if (result instanceof Promise) {
            return err(createValidationError({
                code: VALIDATION_ERROR_CODES.INTERNAL_GUARD_EXCEPTION,
                message: "Async guards are not supported in synchronous parse",
                path,
            }));
        }
        if (!isOk(result)) {
            return result;
        }
        return ok({
            data: result.value,
            policyMap: {
                [path]: cloneValidationPolicy(this.metadata),
            },
            metadata: cloneValidationPolicy(this.metadata),
        });
    }
}
/**
 * Creates a callable object that is both a GuardExecutor and a PolicySchema.
 * This satisfies existing tests that call the guard directly.
 */
export function createGuardSchema(fn, nameOrOptions = "guard") {
    const schema = new GuardSchema(fn, nameOrOptions);
    const executor = createGuard(fn, nameOrOptions);
    // We want to return the executor function, but with all schema properties attached
    const callable = (value) => executor(value);
    // Attach all methods and properties of GuardSchema to the function
    return Object.assign(callable, {
        metadata: schema.metadata,
        type: undefined,
        policy: (m) => createGuardSchema(fn, nameOrOptions).policy(m),
        parse: (i, p = "/", c) => schema.parse(i, p, c),
    });
}
