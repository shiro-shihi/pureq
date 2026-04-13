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

export class BooleanSchema implements PolicySchema<boolean> {
  declare readonly type: boolean;
  readonly metadata: ValidationPolicy;

  constructor(metadata: ValidationPolicy = DEFAULT_VALIDATION_POLICY) {
    this.metadata = normalizeValidationPolicy(metadata);
  }

  policy(metadata: ValidationPolicy): BooleanSchema {
    return new BooleanSchema(mergeValidationPolicy(this.metadata, metadata));
  }

  parse(input: unknown, path = "/", _context?: ParseRuntimeContext): ParseResult<boolean> {
    const pointerPath = normalizePathToJsonPointer(path);

    if (typeof input !== "boolean") {
      return err(
        invalidTypeError({
          path: pointerPath,
          expected: "boolean",
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