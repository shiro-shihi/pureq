import type { ValidationPolicy } from "../../policy/types.js";
import { type Infer, type ParseResult, type ParseRuntimeContext, type PolicySchema } from "../base.js";
type ObjectShape = Record<string, PolicySchema<unknown>>;
type InferShape<TShape extends ObjectShape> = {
    [K in keyof TShape]: Infer<TShape[K]>;
};
export declare class ObjectSchema<TShape extends ObjectShape> implements PolicySchema<InferShape<TShape>> {
    readonly type: InferShape<TShape>;
    readonly shape: TShape;
    readonly metadata: ValidationPolicy;
    constructor(shape: TShape, metadata?: ValidationPolicy);
    policy(metadata: ValidationPolicy): ObjectSchema<TShape>;
    parse(input: unknown, path?: string, context?: ParseRuntimeContext): ParseResult<InferShape<TShape>>;
}
export {};
