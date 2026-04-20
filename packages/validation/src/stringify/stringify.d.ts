import { type ValidationError } from "../errors/validation-error.js";
import { type Result } from "../result/result.js";
import { type PolicySchema } from "../schema/base.js";
import { type StringifyOptions } from "./types.js";
export declare const stringify: <T>(data: unknown, schema: PolicySchema<T>, options?: StringifyOptions) => Result<string, ValidationError>;
