import type { Middleware } from "../types/http";
import { markPolicyMiddleware } from "../policy/guardrails";

export interface ValidationOptions<T> {
  /**
   * Data validation function.
   * Can be a simple type guard (data is T) or a schema validator (Zod.parse).
   * Should throw an error or return false/null to indicate failure.
   */
  readonly validate: (data: unknown) => T | Promise<T> | boolean | null;
  /**
   * Optional custom error message or factory.
   */
  readonly message?: string | ((data: unknown) => string);
  /**
   * If true, validation failure returns the original data instead of throwing.
   * Useful for soft-fail or logging-only scenarios.
   */
  readonly silent?: boolean;
  /**
   * If true, validation is performed even for non-OK (4xx, 5xx) responses.
   * Default: false.
   */
  readonly validateError?: boolean;
}

/**
 * pureq validation middleware.
 * Provides a zero-dependency bridge to schemas (Zod, Valibot) or custom type guards.
 */
export function validation<T = unknown>(options: ValidationOptions<T>): Middleware {
  const middleware: Middleware = async (req, next) => {
    const response = await next(req);
    let parsedBody: unknown = null;

    // Skip validation for non-OK responses unless explicitly requested
    if (!response.ok && !options.validateError) {
        return response;
    }

    try {
      const validationResponse = response.clone();
      try {
        parsedBody = await validationResponse.json();
      } catch {
        parsedBody = null;
        throw new Error("Validation failed");
      }
      const result = await options.validate(parsedBody);

      if (result === false || result === null) {
          throw new Error("Validation failed");
      }

      // If validation transformed the data (like Zod.parse),
      // we ideally want to pass it through, but HttpResponse is immutable.
      // For pureq, we focus on 'safety' - confirming the data matches.
      return response;
    } catch (error) {
      if (options.silent) {
        console.warn("pureq: validation failed (silent)", error);
        return response;
      }

      const message = typeof options.message === "function" 
        ? options.message(parsedBody) 
        : (options.message ?? (error instanceof Error ? error.message : "Validation failed"));

      const validationError = new Error(message);
      (validationError as any).code = "PUREQ_VALIDATION_ERROR";
      (validationError as any).kind = "validation-error";
      (validationError as any).cause = error;
      throw validationError;
    }
  };

  return markPolicyMiddleware(middleware, {
    name: "validation",
    kind: "validation",
  });
}
