import type { ValidationError } from "../errors/validation-error.js";
import type { Result } from "../result/result.js";
import type { ValidationPolicy } from "../policy/types.js";
export type ParseOptions = {
    maxDepth?: number;
    allowValueInErrors?: boolean;
};
export type ParseRuntimeContext = {
    depth: number;
    maxDepth: number;
    seen: WeakSet<object>;
    options: ParseOptions;
};
export declare const DEFAULT_MAX_PARSE_DEPTH = 20;
export declare const createParseRuntimeContext: (context?: ParseRuntimeContext, options?: ParseOptions) => ParseRuntimeContext;
export declare const createChildParseRuntimeContext: (context: ParseRuntimeContext) => ParseRuntimeContext;
export type ValidationSuccess<T> = {
    data: T;
    policyMap: Record<string, ValidationPolicy>;
    metadata: ValidationPolicy;
};
export type ValidationResult<T> = Result<ValidationSuccess<T>, ValidationError>;
export type ParseResult<T> = ValidationResult<T>;
export interface PolicySchema<T> {
    readonly type: T;
    readonly metadata: ValidationPolicy;
    parse(input: unknown, path?: string, context?: ParseRuntimeContext): ParseResult<T>;
    policy(metadata: ValidationPolicy): PolicySchema<T>;
}
export type Schema<T> = PolicySchema<T>;
export type Infer<TSchema extends Schema<unknown>> = TSchema["type"];
export declare const parseWithOptions: <T>(schema: PolicySchema<T>, input: unknown, path?: string, options?: ParseOptions) => ParseResult<T>;
