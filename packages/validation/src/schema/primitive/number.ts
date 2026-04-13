import { invalidTypeError } from "../../errors/validation-error.js";
import { normalizePathToJsonPointer } from "../../policy/json-pointer.js";
import {
  DEFAULT_VALIDATION_POLICY,
  cloneValidationPolicy,
  mergeValidationPolicy,
  normalizeValidationPolicy,
} from "../../policy/merge.js";
import type { ValidationPolicy } from "../../policy/types.js";
import { err, ok } from "../../result/result.js";
import type { ParseResult, ParseRuntimeContext, PolicySchema } from "../base.js";

const describeValueType = (input: unknown): string => {
  if (input === null) {
    return "null";
  }
  if (Array.isArray(input)) {
    return "array";
  }
  return typeof input;
};

export class NumberSchema implements PolicySchema<number> {
  declare readonly type: number;
  readonly metadata: ValidationPolicy;

  constructor(metadata: ValidationPolicy = DEFAULT_VALIDATION_POLICY) {
    this.metadata = normalizeValidationPolicy(metadata);
  }

  policy(metadata: ValidationPolicy): NumberSchema {
    return new NumberSchema(mergeValidationPolicy(this.metadata, metadata));
  }

  parse(input: unknown, path = "/", _context?: ParseRuntimeContext): ParseResult<number> {
    const pointerPath = normalizePathToJsonPointer(path);

    if (typeof input !== "number" || Number.isNaN(input)) {
      return err(
        invalidTypeError({
          path: pointerPath,
          expected: "number",
          received: describeValueType(input),
        }),
      );
    }

    return ok({
      data: input,
      policyMap: {
        [pointerPath]: cloneValidationPolicy(this.metadata),
      },
      metadata: cloneValidationPolicy(this.metadata),
    });
  }
}