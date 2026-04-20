import { invalidFormatError, invalidTypeError } from "../../errors/validation-error.js";
import { err, ok } from "../../result/result.js";
import { DEFAULT_VALIDATION_POLICY, cloneValidationPolicy, mergeValidationPolicy, normalizeValidationPolicy, } from "../../policy/merge.js";
import { normalizePathToJsonPointer } from "../../policy/json-pointer.js";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const describeValueType = (input) => {
    if (input === null) {
        return "null";
    }
    if (Array.isArray(input)) {
        return "array";
    }
    return typeof input;
};
export class StringSchema {
    validators;
    metadata;
    constructor(validators = [], metadata = DEFAULT_VALIDATION_POLICY) {
        this.validators = validators;
        this.metadata = normalizeValidationPolicy(metadata);
    }
    email() {
        return new StringSchema([
            ...this.validators,
            {
                name: "email",
                validate: (value) => EMAIL_REGEX.test(value),
            },
        ], this.metadata);
    }
    uuid() {
        return new StringSchema([
            ...this.validators,
            {
                name: "uuid",
                validate: (value) => UUID_REGEX.test(value),
            },
        ], this.metadata);
    }
    policy(metadata) {
        return new StringSchema(this.validators, mergeValidationPolicy(this.metadata, metadata));
    }
    parse(input, path = "/", context) {
        const pointerPath = normalizePathToJsonPointer(path);
        if (typeof input !== "string") {
            return err(invalidTypeError({
                path: pointerPath,
                expected: "string",
                received: describeValueType(input),
            }));
        }
        for (const validator of this.validators) {
            if (!validator.validate(input)) {
                return err(invalidFormatError({
                    path: pointerPath,
                    format: validator.name,
                    value: input,
                    includeValue: Boolean(context?.options.allowValueInErrors),
                }));
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
