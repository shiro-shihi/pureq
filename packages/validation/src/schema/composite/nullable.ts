import { cloneValidationPolicy, mergeValidationPolicy, normalizeValidationPolicy } from "../../policy/merge.js";
import type { ValidationPolicy } from "../../policy/types.js";
import { ok } from "../../result/result.js";
import {
  type Infer,
  type ParseResult,
  type ParseRuntimeContext,
  type PolicySchema,
} from "../base.js";

export class NullableSchema<T> implements PolicySchema<T | null> {
  declare readonly type: T | null;

  private readonly inner: PolicySchema<T>;
  readonly metadata: ValidationPolicy;

  constructor(inner: PolicySchema<T>, metadata: ValidationPolicy = inner.metadata) {
    this.inner = inner;
    this.metadata = normalizeValidationPolicy(metadata);
  }

  policy(metadata: ValidationPolicy): NullableSchema<T> {
    return new NullableSchema(this.inner, mergeValidationPolicy(this.metadata, metadata));
  }

  parse(input: unknown, path = "/", context?: ParseRuntimeContext): ParseResult<T | null> {
    if (input === null) {
      const pointerPath = path; // Already normalized if coming from ObjectSchema? 
      // Actually ObjectSchema passes normalized path.
      return ok({
        data: null,
        policyMap: {
          [path]: cloneValidationPolicy(this.metadata),
        },
        metadata: cloneValidationPolicy(this.metadata),
      });
    }

    return this.inner.parse(input, path, context) as ParseResult<T | null>;
  }
}
