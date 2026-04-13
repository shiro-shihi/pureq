import { invalidFormatError, invalidTypeError } from "../../errors/validation-error.js";
import { err, ok } from "../../result/result.js";
import {
  DEFAULT_VALIDATION_POLICY,
  cloneValidationPolicy,
  mergeValidationPolicy,
  normalizeValidationPolicy,
} from "../../policy/merge.js";
import { normalizePathToJsonPointer } from "../../policy/json-pointer.js";
import type { ValidationPolicy } from "../../policy/types.js";
import type { ParseResult, ParseRuntimeContext, PolicySchema } from "../base.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StringValidator = {
  name: string;
  validate: (value: string) => boolean;
};

const describeValueType = (input: unknown): string => {
  if (input === null) {
    return "null";
  }
  if (Array.isArray(input)) {
    return "array";
  }
  return typeof input;
};

export class StringSchema implements PolicySchema<string> {
  declare readonly type: string;

  private readonly validators: StringValidator[];
  readonly metadata: ValidationPolicy;

  constructor(
    validators: StringValidator[] = [],
    metadata: ValidationPolicy = DEFAULT_VALIDATION_POLICY,
  ) {
    this.validators = validators;
    this.metadata = normalizeValidationPolicy(metadata);
  }

  email(): StringSchema {
    return new StringSchema([
      ...this.validators,
      {
        name: "email",
        validate: (value) => EMAIL_REGEX.test(value),
      },
    ], this.metadata);
  }

  uuid(): StringSchema {
    return new StringSchema([
      ...this.validators,
      {
        name: "uuid",
        validate: (value) => UUID_REGEX.test(value),
      },
    ], this.metadata);
  }

  policy(metadata: ValidationPolicy): StringSchema {
    return new StringSchema(this.validators, mergeValidationPolicy(this.metadata, metadata));
  }

  parse(input: unknown, path = "/", context?: ParseRuntimeContext): ParseResult<string> {
    const pointerPath = normalizePathToJsonPointer(path);

    if (typeof input !== "string") {
      return err(
        invalidTypeError({
          path: pointerPath,
          expected: "string",
          received: describeValueType(input),
        }),
      );
    }

    for (const validator of this.validators) {
      if (!validator.validate(input)) {
        return err(
          invalidFormatError({
            path: pointerPath,
            format: validator.name,
            value: input,
            includeValue: Boolean(context?.options.allowValueInErrors),
          }),
        );
      }
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