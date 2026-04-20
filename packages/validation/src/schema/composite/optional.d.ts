import type { ValidationPolicy } from "../../policy/types.js";
import { type ParseResult, type ParseRuntimeContext, type PolicySchema } from "../base.js";
export declare class OptionalSchema<T> implements PolicySchema<T | undefined> {
    readonly type: T | undefined;
    private readonly inner;
    readonly metadata: ValidationPolicy;
    constructor(inner: PolicySchema<T>, metadata?: ValidationPolicy);
    policy(metadata: ValidationPolicy): OptionalSchema<T>;
    parse(input: unknown, path?: string, context?: ParseRuntimeContext): ParseResult<T | undefined>;
}
