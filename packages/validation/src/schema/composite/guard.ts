import { cloneValidationPolicy, mergeValidationPolicy, normalizeValidationPolicy } from "../../policy/merge.js";
import type { ValidationPolicy } from "../../policy/types.js";
import { err, isOk, ok, type Result } from "../../result/result.js";
import {
  type ParseResult,
  type ParseRuntimeContext,
  type PolicySchema,
} from "../base.js";
import { createGuard, type GuardFunction, type GuardOptions } from "../../guard/guard.js";
import { createValidationError, VALIDATION_ERROR_CODES, type ValidationError } from "../../errors/validation-error.js";

/**
 * GuardSchema acts as both a PolicySchema and a callable GuardExecutor.
 * This allows it to be used in pipe() chains while still carrying metadata.
 */
export class GuardSchema<T> implements PolicySchema<T> {
  declare readonly type: T;

  private readonly fn: GuardFunction<T>;
  private readonly nameOrOptions: string | GuardOptions;
  readonly metadata: ValidationPolicy;

  constructor(
    fn: GuardFunction<T>,
    nameOrOptions: string | GuardOptions = "guard",
    metadata: ValidationPolicy = {}
  ) {
    this.fn = fn;
    this.nameOrOptions = nameOrOptions;
    this.metadata = normalizeValidationPolicy(metadata);
  }

  policy(metadata: ValidationPolicy): GuardSchema<T> {
    return new GuardSchema(this.fn, this.nameOrOptions, mergeValidationPolicy(this.metadata, metadata));
  }

  /**
   * Implementation of PolicySchema.parse.
   * Returns a full ValidationResult with metadata.
   */
  parse(input: unknown, path = "/", context?: ParseRuntimeContext): ParseResult<T> {
    const executor = createGuard(this.fn, this.nameOrOptions);
    
    // In sync parse, we must handle async guards by returning an error
    const result = executor(input as T);

    if (result instanceof Promise) {
      return err(createValidationError({
        code: VALIDATION_ERROR_CODES.INTERNAL_GUARD_EXCEPTION,
        message: "Async guards are not supported in synchronous parse",
        path,
      }));
    }

    if (!isOk(result)) {
      return result;
    }

    return ok({
      data: result.value as T,
      policyMap: {
        [path]: cloneValidationPolicy(this.metadata),
      },
      metadata: cloneValidationPolicy(this.metadata),
    });
  }
}

/**
 * Creates a callable object that is both a GuardExecutor and a PolicySchema.
 * This satisfies existing tests that call the guard directly.
 */
export function createGuardSchema<T>(
  fn: GuardFunction<T>,
  nameOrOptions: string | GuardOptions = "guard"
): GuardSchema<T> & ((value: T) => Result<T, ValidationError> | Promise<Result<T, ValidationError>>) {
  const schema = new GuardSchema(fn, nameOrOptions);
  const executor = createGuard(fn, nameOrOptions);

  // We want to return the executor function, but with all schema properties attached
  const callable = (value: T) => executor(value);

  // Attach all methods and properties of GuardSchema to the function
  return Object.assign(callable, {
    metadata: schema.metadata,
    type: undefined as any,
    policy: (m: ValidationPolicy) => createGuardSchema(fn, nameOrOptions).policy(m),
    parse: (i: unknown, p = "/", c?: ParseRuntimeContext) => schema.parse(i, p, c),
  }) as any;
}
