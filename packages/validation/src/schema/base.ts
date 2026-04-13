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

export const DEFAULT_MAX_PARSE_DEPTH = 20;

export const createParseRuntimeContext = (
  context?: ParseRuntimeContext,
  options?: ParseOptions,
): ParseRuntimeContext => {
  if (context) {
    return context;
  }

  return {
    depth: 0,
    maxDepth: options?.maxDepth ?? DEFAULT_MAX_PARSE_DEPTH,
    seen: new WeakSet<object>(),
    options: options ?? {},
  };
};

export const createChildParseRuntimeContext = (
  context: ParseRuntimeContext,
): ParseRuntimeContext => {
  return {
    depth: context.depth + 1,
    maxDepth: context.maxDepth,
    seen: context.seen,
    options: context.options,
  };
};

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

export const parseWithOptions = <T>(
  schema: PolicySchema<T>,
  input: unknown,
  path = "/",
  options: ParseOptions = {},
): ParseResult<T> => {
  return schema.parse(input, path, createParseRuntimeContext(undefined, options));
};