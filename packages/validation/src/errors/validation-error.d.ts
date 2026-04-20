export declare const VALIDATION_ERROR_CODES: {
    readonly INVALID_TYPE: "invalid_type";
    readonly INVALID_FORMAT: "invalid_format";
    readonly FORBIDDEN_KEY: "forbidden_key";
    readonly MAX_DEPTH_EXCEEDED: "max_depth_exceeded";
    readonly CYCLIC_REFERENCE: "cyclic_reference";
    readonly OUT_OF_RANGE: "out_of_range";
    readonly REQUIRED: "required";
    readonly FORBIDDEN_SCOPE: "forbidden_scope";
    readonly GUARDRAIL_FAILED: "guardrail_failed";
    readonly GUARD_TIMEOUT: "guard_timeout";
    readonly INTERNAL_GUARD_EXCEPTION: "internal_guard_exception";
};
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
export declare const createValidationError: ({ code, message, path, details, cause }: ValidationErrorInput) => ValidationError;
export declare const invalidTypeError: (params: {
    path: string;
    expected: string;
    received: string;
}) => ValidationError;
export declare const invalidFormatError: (params: {
    path: string;
    format: string;
    value?: string;
    includeValue?: boolean;
}) => ValidationError;
export declare const requiredError: (path: string) => ValidationError;
export declare const forbiddenKeyError: (params: {
    path: string;
    key: string;
}) => ValidationError;
export declare const maxDepthExceededError: (params: {
    path: string;
    maxDepth: number;
}) => ValidationError;
export declare const cyclicReferenceError: (path: string) => ValidationError;
export declare const guardTimeoutError: (params: {
    name: string;
    timeoutMs: number;
}) => ValidationError;
export {};
