import type { ValidationPolicy } from "../../policy/types.js";
import type { ParseResult, ParseRuntimeContext, PolicySchema } from "../base.js";
export declare class NumberSchema implements PolicySchema<number> {
    readonly type: number;
    readonly metadata: ValidationPolicy;
    constructor(metadata?: ValidationPolicy);
    policy(metadata: ValidationPolicy): NumberSchema;
    parse(input: unknown, path?: string, _context?: ParseRuntimeContext): ParseResult<number>;
}
