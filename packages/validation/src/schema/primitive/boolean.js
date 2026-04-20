import { invalidTypeError } from "../../errors/validation-error.js";
import { normalizePathToJsonPointer } from "../../policy/json-pointer.js";
import { DEFAULT_VALIDATION_POLICY, cloneValidationPolicy, mergeValidationPolicy, normalizeValidationPolicy, } from "../../policy/merge.js";
import { err, ok } from "../../result/result.js";
const describeValueType = (input) => {
    if (input === null) {
        return "null";
    }
    if (Array.isArray(input)) {
        return "array";
    }
    return typeof input;
};
export class BooleanSchema {
    metadata;
    constructor(metadata = DEFAULT_VALIDATION_POLICY) {
        this.metadata = normalizeValidationPolicy(metadata);
    }
    policy(metadata) {
        return new BooleanSchema(mergeValidationPolicy(this.metadata, metadata));
    }
    parse(input, path = "/", _context) {
        const pointerPath = normalizePathToJsonPointer(path);
        if (typeof input !== "boolean") {
            return err(invalidTypeError({
                path: pointerPath,
                expected: "boolean",
                received: describeValueType(input),
            }));
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
