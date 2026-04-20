import type { ValidationPolicy } from "../../policy/types.js";
import { type Result } from "../../result/result.js";
import { type ParseResult, type ParseRuntimeContext, type PolicySchema } from "../base.js";
import { type GuardFunction, type GuardOptions } from "../../guard/guard.js";
import { type ValidationError } from "../../errors/validation-error.js";
/**
 * GuardSchema acts as both a PolicySchema and a callable GuardExecutor.
 * This allows it to be used in pipe() chains while still carrying metadata.
 */
export declare class GuardSchema<T> implements PolicySchema<T> {
    readonly type: T;
    private readonly fn;
    private readonly nameOrOptions;
    readonly metadata: ValidationPolicy;
    constructor(fn: GuardFunction<T>, nameOrOptions?: string | GuardOptions, metadata?: ValidationPolicy);
    policy(metadata: ValidationPolicy): GuardSchema<T>;
    /**
     * Implementation of PolicySchema.parse.
     * Returns a full ValidationResult with metadata.
     */
    parse(input: unknown, path?: string, context?: ParseRuntimeContext): ParseResult<T>;
}
/**
 * Creates a callable object that is both a GuardExecutor and a PolicySchema.
 * This satisfies existing tests that call the guard directly.
 */
export declare function createGuardSchema<T>(fn: GuardFunction<T>, nameOrOptions?: string | GuardOptions): GuardSchema<T> & ((value: T) => Result<T, ValidationError> | Promise<Result<T, ValidationError>>);
