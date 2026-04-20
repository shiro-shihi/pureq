import { cyclicReferenceError, invalidTypeError, maxDepthExceededError, } from "../../errors/validation-error.js";
import { decodeJsonPointer, encodeJsonPointer, normalizePathToJsonPointer } from "../../policy/json-pointer.js";
import { DEFAULT_VALIDATION_POLICY, cloneValidationPolicy, mergeValidationPolicy, normalizeValidationPolicy, } from "../../policy/merge.js";
import { err, isErr, ok } from "../../result/result.js";
import { createChildParseRuntimeContext, createParseRuntimeContext, } from "../base.js";
const describeValueType = (input) => {
    if (input === null) {
        return "null";
    }
    if (Array.isArray(input)) {
        return "array";
    }
    return typeof input;
};
export class ArraySchema {
    itemSchema;
    metadata;
    constructor(itemSchema, metadata = DEFAULT_VALIDATION_POLICY) {
        this.itemSchema = itemSchema;
        this.metadata = normalizeValidationPolicy(metadata);
    }
    policy(metadata) {
        return new ArraySchema(this.itemSchema, mergeValidationPolicy(this.metadata, metadata));
    }
    parse(input, path = "/", context) {
        const pointerPath = normalizePathToJsonPointer(path);
        const runtimeContext = createParseRuntimeContext(context);
        if (runtimeContext.depth >= runtimeContext.maxDepth) {
            return err(maxDepthExceededError({
                path: pointerPath,
                maxDepth: runtimeContext.maxDepth,
            }));
        }
        if (!Array.isArray(input)) {
            return err(invalidTypeError({
                path: pointerPath,
                expected: "array",
                received: describeValueType(input),
            }));
        }
        const values = [];
        const policyMap = {
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
                values.push(parsed.value.data);
                Object.assign(policyMap, parsed.value.policyMap);
            }
        }
        finally {
            runtimeContext.seen.delete(input);
        }
        return ok({
            data: values,
            policyMap,
            metadata: cloneValidationPolicy(this.metadata),
        });
    }
}
