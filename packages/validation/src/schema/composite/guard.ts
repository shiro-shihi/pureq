import { cloneValidationPolicy, mergeValidationPolicy, normalizeValidationPolicy } from "../../policy/merge.js";
import type { ValidationPolicy } from "../../policy/types.js";
import { err, isOk, ok } from "../../result/result.js";
import {
  type ParseResult,
  type ParseRuntimeContext,
  type PolicySchema,
} from "../base.js";
import { createGuard, type GuardFunction, type GuardOptions } from "../../guard/guard.js";

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

  parse(input: unknown, path = "/", context?: ParseRuntimeContext): ParseResult<T> {
    const executor = createGuard(this.fn, this.nameOrOptions);
    const result = executor(input as T);

    if (result instanceof Promise) {
        // PolicySchema.parse is currently synchronous in @pureq/validation/src/schema/base.ts
        // This is a limitation of the current architecture if we want to support async guards in sync parse.
        // For now, we might need to throw or handle it.
        // But since DB driver is async, maybe we can make it work.
        throw new Error("Async guards are not supported in synchronous parse");
    }

    if (!isOk(result)) {
        return result;
    }

    return ok({
      data: result.value,
      policyMap: {
        [path]: cloneValidationPolicy(this.metadata),
      },
      metadata: cloneValidationPolicy(this.metadata),
    });
  }
}
