import { createValidationError, VALIDATION_ERROR_CODES, type ValidationError } from "../errors/validation-error.js";
import { isErr, ok, type Result, err } from "../result/result.js";
import { parseWithOptions, type ParseResult, type PolicySchema } from "../schema/base.js";
import { type StringifyOptions } from "./types.js";

type RenderResult =
  | { present: true; value: unknown }
  | { present: false };

const REDACTED_VALUE = "[REDACTED]";
const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const describeValueType = (input: unknown): string => {
  if (input === null) {
    return "null";
  }

  if (Array.isArray(input)) {
    return "array";
  }

  return typeof input;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const hasAccess = (requiredScopes: readonly string[] | undefined, grantedScopes: readonly string[] | undefined): boolean => {
  if (!requiredScopes || requiredScopes.length === 0) {
    return true;
  }

  if (!grantedScopes || grantedScopes.length === 0) {
    return false;
  }

  return requiredScopes.some((scope) => grantedScopes.includes(scope));
};

const createDeniedError = (path: string): ValidationError =>
  createValidationError({
    code: VALIDATION_ERROR_CODES.FORBIDDEN_SCOPE,
    message: "Field is not accessible for the provided scope",
    path,
  });

const maskValue = (): unknown => REDACTED_VALUE;

const renderValue = (
  value: unknown,
  path: string,
  policyMap: Record<string, { redact?: "mask" | "hide" | "none"; pii?: boolean; scope?: string[]; onDenied?: "drop" | "error" }>,
  grantedScope: readonly string[] | undefined,
): Result<RenderResult, ValidationError> => {
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
    const rendered: unknown[] = [];

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
    const rendered: Record<string, unknown> = Object.create(null);

    for (const [key, childValue] of Object.entries(value)) {
      if (FORBIDDEN_OBJECT_KEYS.has(key)) {
        return err(
          createValidationError({
            code: VALIDATION_ERROR_CODES.FORBIDDEN_KEY,
            message: `Forbidden object key: ${key}`,
            path: `${path === "/" ? "" : path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
            details: {
              key,
            },
          }),
        );
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

const stringifyParsedValue = (
  parsed: ParseResult<unknown>,
  grantedScope: readonly string[] | undefined,
): Result<string, ValidationError> => {
  if (isErr(parsed)) {
    return parsed;
  }

  const rendered = renderValue(parsed.value.data, "/", parsed.value.policyMap as Record<string, any>, grantedScope);

  if (isErr(rendered)) {
    return rendered;
  }

  if (!rendered.value.present) {
    return ok("null");
  }

  return ok(JSON.stringify(rendered.value.value));
};

export const stringify = <T>(
  data: unknown,
  schema: PolicySchema<T>,
  options: StringifyOptions = {},
): Result<string, ValidationError> => {
  try {
    const parseOptions = {
      allowValueInErrors: false,
      ...(options.maxDepth !== undefined ? { maxDepth: options.maxDepth } : {}),
    };

    const parsed = parseWithOptions(schema, data, "/", parseOptions);
    return stringifyParsedValue(parsed, options.scope);
  } catch (cause) {
    return err(
      createValidationError({
        code: VALIDATION_ERROR_CODES.INTERNAL_GUARD_EXCEPTION,
        message: "Stringify failed unexpectedly",
        path: "/",
        cause: cause instanceof Error ? cause.message : String(cause),
      }),
    );
  }
};