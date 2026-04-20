import { cloneValidationPolicy, mergeValidationPolicy, normalizeValidationPolicy } from "../../policy/merge.js";
import { ok } from "../../result/result.js";
export class NullableSchema {
    inner;
    metadata;
    constructor(inner, metadata = inner.metadata) {
        this.inner = inner;
        this.metadata = normalizeValidationPolicy(metadata);
    }
    policy(metadata) {
        return new NullableSchema(this.inner, mergeValidationPolicy(this.metadata, metadata));
    }
    parse(input, path = "/", context) {
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
        return this.inner.parse(input, path, context);
    }
}
