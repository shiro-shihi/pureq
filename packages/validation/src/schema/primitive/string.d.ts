import type { ValidationPolicy } from "../../policy/types.js";
import type { ParseResult, ParseRuntimeContext, PolicySchema } from "../base.js";
type StringValidator = {
    name: string;
    validate: (value: string) => boolean;
};
export declare class StringSchema implements PolicySchema<string> {
    readonly type: string;
    private readonly validators;
    readonly metadata: ValidationPolicy;
    constructor(validators?: StringValidator[], metadata?: ValidationPolicy);
    email(): StringSchema;
    uuid(): StringSchema;
    policy(metadata: ValidationPolicy): StringSchema;
    parse(input: unknown, path?: string, context?: ParseRuntimeContext): ParseResult<string>;
}
export {};
