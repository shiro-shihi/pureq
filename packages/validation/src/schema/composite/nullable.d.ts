import type { ValidationPolicy } from "../../policy/types.js";
import { type ParseResult, type ParseRuntimeContext, type PolicySchema } from "../base.js";
export declare class NullableSchema<T> implements PolicySchema<T | null> {
    readonly type: T | null;
    private readonly inner;
    readonly metadata: ValidationPolicy;
    constructor(inner: PolicySchema<T>, metadata?: ValidationPolicy);
    policy(metadata: ValidationPolicy): NullableSchema<T>;
    parse(input: unknown, path?: string, context?: ParseRuntimeContext): ParseResult<T | null>;
}
