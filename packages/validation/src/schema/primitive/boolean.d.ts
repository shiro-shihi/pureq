import type { ValidationPolicy } from "../../policy/types.js";
import type { ParseResult, ParseRuntimeContext, PolicySchema } from "../base.js";
export declare class BooleanSchema implements PolicySchema<boolean> {
    readonly type: boolean;
    readonly metadata: ValidationPolicy;
    constructor(metadata?: ValidationPolicy);
    policy(metadata: ValidationPolicy): BooleanSchema;
    parse(input: unknown, path?: string, _context?: ParseRuntimeContext): ParseResult<boolean>;
}
