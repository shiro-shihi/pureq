import type { ValidationPolicy } from "../../policy/types.js";
import { type Infer, type ParseResult, type ParseRuntimeContext, type PolicySchema } from "../base.js";
export declare class ArraySchema<TItemSchema extends PolicySchema<unknown>> implements PolicySchema<Infer<TItemSchema>[]> {
    readonly type: Infer<TItemSchema>[];
    private readonly itemSchema;
    readonly metadata: ValidationPolicy;
    constructor(itemSchema: TItemSchema, metadata?: ValidationPolicy);
    policy(metadata: ValidationPolicy): ArraySchema<TItemSchema>;
    parse(input: unknown, path?: string, context?: ParseRuntimeContext): ParseResult<Infer<TItemSchema>[]>;
}
