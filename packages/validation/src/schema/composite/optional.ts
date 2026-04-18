import { cloneValidationPolicy, mergeValidationPolicy, normalizeValidationPolicy } from "../../policy/merge.js";
import type { ValidationPolicy } from "../../policy/types.js";
import { ok } from "../../result/result.js";
import {
  type ParseResult,
  type ParseRuntimeContext,
  type PolicySchema,
} from "../base.js";

export class OptionalSchema<T> implements PolicySchema<T | undefined> {
  declare readonly type: T | undefined;

  private readonly inner: PolicySchema<T>;
  readonly metadata: ValidationPolicy;

  constructor(inner: PolicySchema<T>, metadata: ValidationPolicy = inner.metadata) {
    this.inner = inner;
    this.metadata = normalizeValidationPolicy(metadata);
  }

  policy(metadata: ValidationPolicy): OptionalSchema<T> {
    return new OptionalSchema(this.inner, mergeValidationPolicy(this.metadata, metadata));
  }

  parse(input: unknown, path = "/", context?: ParseRuntimeContext): ParseResult<T | undefined> {
    if (input === undefined) {
      return ok({
        data: undefined,
        policyMap: {
          [path]: cloneValidationPolicy(this.metadata),
        },
        metadata: cloneValidationPolicy(this.metadata),
      });
    }

    return this.inner.parse(input, path, context) as ParseResult<T | undefined>;
  }
}
