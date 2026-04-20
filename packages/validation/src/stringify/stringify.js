import { createValidationError, VALIDATION_ERROR_CODES } from "../errors/validation-error.js";
import { isErr, ok, err } from "../result/result.js";
import { parseWithOptions } from "../schema/base.js";
const REDACTED_VALUE = "[REDACTED]";
const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const describeValueType = (input) => {
    if (input === null) {
        return "null";
    }
    if (Array.isArray(input)) {
        return "array";
    }
    return typeof input;
};
const isPlainObject = (value) => {
    return typeof value === "object" && value !== null && !Array.isArray(value);
};
const hasAccess = (requiredScopes, grantedScopes) => {
    if (!requiredScopes || requiredScopes.length === 0) {
        return true;
    }
    if (!grantedScopes || grantedScopes.length === 0) {
        return false;
    }
    return requiredScopes.some((scope) => grantedScopes.includes(scope));
};
const createDeniedError = (path) => createValidationError({
    code: VALIDATION_ERROR_CODES.FORBIDDEN_SCOPE,
    message: "Field is not accessible for the provided scope",
    path,
});
const maskValue = () => REDACTED_VALUE;
const renderValue = (value, path, policyMap, grantedScope) => {
    const policy = policyMap[path];
    if (policy && !hasAccess(policy.scope, grantedScope)) {
        if (policy.onDenied === "drop") {
            return ok({ present: false });
        }
        return err(createDeniedError(path));
    }
    const shouldHide = policy?.pii === true && policy.redact === "hide";
    if (shouldHide) {
        return ok({ present: false });
    }
    const shouldMask = policy?.pii === true && policy.redact === "mask";
    if (shouldMask) {
        return ok({ present: true, value: maskValue() });
    }
    if (Array.isArray(value)) {
        const rendered = [];
        for (let index = 0; index < value.length; index += 1) {
            const childPath = `${path === "/" ? "" : path}/${index}`.replace(/\/\//g, "/");
            const child = renderValue(value[index], childPath, policyMap, grantedScope);
            if (isErr(child)) {
                return child;
            }
            if (child.value.present) {
                rendered.push(child.value.value);
            }
        }
        return ok({ present: true, value: rendered });
    }
    if (isPlainObject(value)) {
        const rendered = Object.create(null);
        for (const [key, childValue] of Object.entries(value)) {
            if (FORBIDDEN_OBJECT_KEYS.has(key)) {
                return err(createValidationError({
                    code: VALIDATION_ERROR_CODES.FORBIDDEN_KEY,
                    message: `Forbidden object key: ${key}`,
                    path: `${path === "/" ? "" : path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
                    details: {
                        key,
                    },
                }));
            }
            const childPath = `${path === "/" ? "" : path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
            const child = renderValue(childValue, childPath, policyMap, grantedScope);
            if (isErr(child)) {
                return child;
            }
            if (child.value.present) {
                rendered[key] = child.value.value;
            }
        }
        return ok({ present: true, value: rendered });
    }
    return ok({ present: true, value });
};
const stringifyParsedValue = (parsed, grantedScope) => {
    if (isErr(parsed)) {
        return parsed;
    }
    const rendered = renderValue(parsed.value.data, "/", parsed.value.policyMap, grantedScope);
    if (isErr(rendered)) {
        return rendered;
    }
    if (!rendered.value.present) {
        return ok("null");
    }
    return ok(JSON.stringify(rendered.value.value));
};
export const stringify = (data, schema, options = {}) => {
    try {
        const parseOptions = {
            allowValueInErrors: false,
            ...(options.maxDepth !== undefined ? { maxDepth: options.maxDepth } : {}),
        };
        const parsed = parseWithOptions(schema, data, "/", parseOptions);
        return stringifyParsedValue(parsed, options.scope);
    }
    catch (cause) {
        return err(createValidationError({
            code: VALIDATION_ERROR_CODES.INTERNAL_GUARD_EXCEPTION,
            message: "Stringify failed unexpectedly",
            path: "/",
            cause: cause instanceof Error ? cause.message : String(cause),
        }));
    }
};
