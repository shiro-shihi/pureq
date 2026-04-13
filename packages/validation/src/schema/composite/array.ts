import {
  cyclicReferenceError,
  invalidTypeError,
  maxDepthExceededError,
} from "../../errors/validation-error.js";
import { decodeJsonPointer, encodeJsonPointer, normalizePathToJsonPointer } from "../../policy/json-pointer.js";
import {
  DEFAULT_VALIDATION_POLICY,
  cloneValidationPolicy,
  mergeValidationPolicy,
  normalizeValidationPolicy,
} from "../../policy/merge.js";
import type { ValidationPolicy } from "../../policy/types.js";
import { err, isErr, ok } from "../../result/result.js";
import {
  createChildParseRuntimeContext,
  createParseRuntimeContext,
  type Infer,
  type ParseResult,
  type ParseRuntimeContext,
  type PolicySchema,
} from "../base.js";

const describeValueType = (input: unknown): string => {
  if (input === null) {
    return "null";
  }
  if (Array.isArray(input)) {
    return "array";
  }
  return typeof input;
};

export class ArraySchema<TItemSchema extends PolicySchema<unknown>>
  implements PolicySchema<Infer<TItemSchema>[]>
{
  declare readonly type: Infer<TItemSchema>[];

  private readonly itemSchema: TItemSchema;
  readonly metadata: ValidationPolicy;

  constructor(itemSchema: TItemSchema, metadata: ValidationPolicy = DEFAULT_VALIDATION_POLICY) {
    this.itemSchema = itemSchema;
    this.metadata = normalizeValidationPolicy(metadata);
  }

  policy(metadata: ValidationPolicy): ArraySchema<TItemSchema> {
    return new ArraySchema(this.itemSchema, mergeValidationPolicy(this.metadata, metadata));
  }

  parse(input: unknown, path = "/", context?: ParseRuntimeContext): ParseResult<Infer<TItemSchema>[]> {
    const pointerPath = normalizePathToJsonPointer(path);
    const runtimeContext = createParseRuntimeContext(context);

    if (runtimeContext.depth >= runtimeContext.maxDepth) {
      return err(
        maxDepthExceededError({
          path: pointerPath,
          maxDepth: runtimeContext.maxDepth,
        }),
      );
    }

    if (!Array.isArray(input)) {
      return err(
        invalidTypeError({
          path: pointerPath,
          expected: "array",
          received: describeValueType(input),
        }),
      );
    }

    const values: Infer<TItemSchema>[] = [];
    const policyMap: Record<string, ValidationPolicy> = {
      [pointerPath]: cloneValidationPolicy(this.metadata),
    };

    if (runtimeContext.seen.has(input)) {
      return err(cyclicReferenceError(pointerPath));
    }

    runtimeContext.seen.add(input);

    const parentTokens = decodeJsonPointer(pointerPath);
    const childContext = createChildParseRuntimeContext(runtimeContext);

    try {
      for (let index = 0; index < input.length; index += 1) {
        const childPath = encodeJsonPointer([...parentTokens, String(index)]);
        const parsed = this.itemSchema.parse(input[index], childPath, childContext);

        if (isErr(parsed)) {
          return parsed;
        }

        values.push(parsed.value.data as Infer<TItemSchema>);
        Object.assign(policyMap, parsed.value.policyMap);
      }
    } finally {
      runtimeContext.seen.delete(input);
    }

    return ok({
      data: values,
      policyMap,
      metadata: cloneValidationPolicy(this.metadata),
    });
  }
}
