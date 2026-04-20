import { cloneValidationPolicy, mergeValidationPolicy, normalizeValidationPolicy } from "../../policy/merge.js";
import { ok } from "../../result/result.js";
export class OptionalSchema {
    inner;
    metadata;
    constructor(inner, metadata = inner.metadata) {
        this.inner = inner;
        this.metadata = normalizeValidationPolicy(metadata);
    }
    policy(metadata) {
        return new OptionalSchema(this.inner, mergeValidationPolicy(this.metadata, metadata));
    }
    parse(input, path = "/", context) {
        if (input === undefined) {
            return ok({
                data: undefined,
                policyMap: {
                    [path]: cloneValidationPolicy(this.metadata),
                },
                metadata: cloneValidationPolicy(this.metadata),
            });
        }
        return this.inner.parse(input, path, context);
    }
}
