export const VALIDATION_ERROR_CODES = {
  INVALID_TYPE: "invalid_type",
  INVALID_FORMAT: "invalid_format",
  FORBIDDEN_KEY: "forbidden_key",
  MAX_DEPTH_EXCEEDED: "max_depth_exceeded",
  CYCLIC_REFERENCE: "cyclic_reference",
  OUT_OF_RANGE: "out_of_range",
  REQUIRED: "required",
  FORBIDDEN_SCOPE: "forbidden_scope",
  GUARDRAIL_FAILED: "guardrail_failed",
  GUARD_TIMEOUT: "guard_timeout",
  INTERNAL_GUARD_EXCEPTION: "internal_guard_exception",
} as const;

export type ValidationErrorCode = (typeof VALIDATION_ERROR_CODES)[keyof typeof VALIDATION_ERROR_CODES];

export type ValidationError = {
  code: ValidationErrorCode;
  message: string;
  path: string;
  details?: Record<string, unknown>;
  cause?: string;
};

type ValidationErrorInput = {
  code: ValidationErrorCode;
  message: string;
  path: string;
  details?: Record<string, unknown>;
  cause?: string;
};

export const createValidationError = ({ code, message, path, details, cause }: ValidationErrorInput): ValidationError => ({
  code,
  message,
  path,
  ...(details ? { details } : {}),
  ...(cause ? { cause } : {}),
});

export const invalidTypeError = (params: {
  path: string;
  expected: string;
  received: string;
}): ValidationError =>
  createValidationError({
    code: VALIDATION_ERROR_CODES.INVALID_TYPE,
    message: `Expected ${params.expected} but received ${params.received}`,
    path: params.path,
    details: {
      expected: params.expected,
      received: params.received,
    },
  });

export const invalidFormatError = (params: {
  path: string;
  format: string;
  value?: string;
  includeValue?: boolean;
}): ValidationError =>
  createValidationError({
    code: VALIDATION_ERROR_CODES.INVALID_FORMAT,
    message: `Expected ${params.format} format`,
    path: params.path,
    details: {
      format: params.format,
      ...(params.includeValue && params.value !== undefined ? { value: params.value } : {}),
    },
  });

export const requiredError = (path: string): ValidationError =>
  createValidationError({
    code: VALIDATION_ERROR_CODES.REQUIRED,
    message: "Required value is missing",
    path,
  });

export const forbiddenKeyError = (params: {
  path: string;
  key: string;
}): ValidationError =>
  createValidationError({
    code: VALIDATION_ERROR_CODES.FORBIDDEN_KEY,
    message: `Forbidden object key: ${params.key}`,
    path: params.path,
    details: {
      key: params.key,
    },
  });

export const maxDepthExceededError = (params: {
  path: string;
  maxDepth: number;
}): ValidationError =>
  createValidationError({
    code: VALIDATION_ERROR_CODES.MAX_DEPTH_EXCEEDED,
    message: `Maximum parse depth ${params.maxDepth} exceeded`,
    path: params.path,
    details: {
      maxDepth: params.maxDepth,
    },
  });

export const cyclicReferenceError = (path: string): ValidationError =>
  createValidationError({
    code: VALIDATION_ERROR_CODES.CYCLIC_REFERENCE,
    message: "Cyclic reference detected in input",
    path,
  });

export const guardTimeoutError = (params: {
  name: string;
  timeoutMs: number;
}): ValidationError =>
  createValidationError({
    code: VALIDATION_ERROR_CODES.GUARD_TIMEOUT,
    message: `Guard "${params.name}" timed out after ${params.timeoutMs}ms`,
    path: "/",
    details: {
      guard: params.name,
      timeoutMs: params.timeoutMs,
    },
  });