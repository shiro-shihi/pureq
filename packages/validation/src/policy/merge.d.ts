import type { ValidationPolicy } from "./types.js";
export declare const DEFAULT_VALIDATION_POLICY: Required<ValidationPolicy>;
export declare const normalizeValidationPolicy: (policy?: ValidationPolicy) => Required<ValidationPolicy>;
export declare const cloneValidationPolicy: (policy: ValidationPolicy) => Required<ValidationPolicy>;
export declare const mergeValidationPolicy: (base: ValidationPolicy, next: ValidationPolicy) => ValidationPolicy;
