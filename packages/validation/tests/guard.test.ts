import { describe, it, expect } from "vitest";
import { v, ok, err, pipe, pipeAsync, VALIDATION_ERROR_CODES, createValidationError } from "../src/index";

describe("Issue 10: Guardrail Chain and Pipe Integration", () => {
  describe("v.guard - basic guard creation", () => {
    it("should accept a boolean-returning guard function", () => {
      const positiveGuard = v.guard((val: number) => val > 0, "positive");
      const result = positiveGuard(5);
      
      expect(result).toEqual(ok(5));
    });

    it("should return false validation as error", () => {
      const positiveGuard = v.guard((val: number) => val > 0, "positive");
      const result = positiveGuard(-5);
      
      if (result instanceof Promise) {
        throw new Error("Expected sync result");
      }
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(VALIDATION_ERROR_CODES.GUARDRAIL_FAILED);
        expect(result.error.message).toContain("positive");
      }
    });

    it("should accept Result-returning guard function", () => {
      const guard = v.guard((val: number) => {
        return val > 0 ? ok(val) : err(createValidationError({
          code: VALIDATION_ERROR_CODES.GUARDRAIL_FAILED,
          message: "Value must be positive",
          path: "/"
        }));
      }, "result-guard");
      
      const result = guard(10);
      expect(result).toEqual(ok(10));
    });

    it("should catch synchronous exceptions", () => {
      const throwGuard = v.guard(() => {
        throw new Error("Sync error");
      }, "throw-guard");
      
      const result = throwGuard("test");
      if (result instanceof Promise) {
        throw new Error("Expected sync result");
      }
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(VALIDATION_ERROR_CODES.INTERNAL_GUARD_EXCEPTION);
        expect(result.error.cause).toBe("Sync error");
      }
    });
  });

  describe("async guards", () => {
    it("should support async guard functions", async () => {
      const asyncGuard = v.guard(async (val: number) => val > 0, "async-positive");
      const result = asyncGuard(5);
      
      if (!(result instanceof Promise)) {
        throw new Error("Expected Promise from async guard");
      }
      const resolved = await result;
      expect(resolved).toEqual(ok(5));
    });

    it("should handle async guard failures", async () => {
      const asyncGuard = v.guard(async (val: number) => val > 0, "async-positive");
      const result = asyncGuard(-5);
      
      if (!(result instanceof Promise)) {
        throw new Error("Expected Promise from async guard");
      }
      const resolved = await result;
      expect(resolved.ok).toBe(false);
      if (!resolved.ok) {
        expect(resolved.error.code).toBe(VALIDATION_ERROR_CODES.GUARDRAIL_FAILED);
      }
    });

    it("should catch async exceptions", async () => {
      const asyncThrowGuard = v.guard(async () => {
        throw new Error("Async error");
      }, "async-throw");
      
      const result = asyncThrowGuard("test");
      if (!(result instanceof Promise)) {
        throw new Error("Expected Promise from async guard");
      }
      const resolved = await result;
      expect(resolved.ok).toBe(false);
      if (!resolved.ok) {
        expect(resolved.error.code).toBe(VALIDATION_ERROR_CODES.INTERNAL_GUARD_EXCEPTION);
        expect(resolved.error.cause).toBe("Async error");
      }
    });

    it("should timeout async guard execution when timeoutMs is exceeded", async () => {
      const timeoutGuard = v.guard(
        async () => new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(true), 50);
        }),
        { name: "slow-guard", timeoutMs: 10 },
      );

      const result = timeoutGuard("test");
      if (!(result instanceof Promise)) {
        throw new Error("Expected Promise from async guard");
      }

      const resolved = await result;
      expect(resolved.ok).toBe(false);
      if (!resolved.ok) {
        expect(resolved.error.code).toBe(VALIDATION_ERROR_CODES.GUARD_TIMEOUT);
      }
    });
  });

  describe("pipe integration - chain order", () => {
    it("should execute guards in order", () => {
      const order: string[] = [];
      
      const guard1 = v.guard((val: number) => {
        order.push("guard1");
        return val > 0;
      }, "guard1");
      
      const guard2 = v.guard((val: number) => {
        order.push("guard2");
        return val < 100;
      }, "guard2");
      
      const guard3 = v.guard((val: number) => {
        order.push("guard3");
        return val % 2 === 0;
      }, "guard3");
      
      const result = pipe(ok(42), guard1, guard2, guard3);
      
      expect(order).toEqual(["guard1", "guard2", "guard3"]);
      expect(result).toEqual(ok(42));
    });

    it("should maintain input value through guard chain", () => {
      const guard1 = v.guard((val: number) => val > 0, "positive");
      const guard2 = v.guard((val: number) => val < 100, "under-100");
      
      const result = pipe(ok(50), guard1, guard2);
      
      expect(result).toEqual(ok(50));
    });
  });

  describe("pipe integration - short-circuit behavior", () => {
    it("should short-circuit on first failure", () => {
      const order: string[] = [];
      
      const guard1 = v.guard((val: number) => {
        order.push("guard1");
        return val > 0;
      }, "guard1");
      
      const guard2 = v.guard(() => {
        order.push("guard2");
        throw new Error("Should not execute");
      }, "guard2");
      
      const guard3 = v.guard(() => {
        order.push("guard3");
        throw new Error("Should not execute");
      }, "guard3");
      
      const result = pipe(ok(-5), guard1, guard2, guard3);
      
      expect(order).toEqual(["guard1"]); // Only guard1 executes, guard2 and guard3 are skipped
      expect(result.ok).toBe(false);
    });

    it("should return initial error without processing guards", () => {
      const order: string[] = [];
      
      const guard1 = v.guard(() => {
        order.push("guard1");
        throw new Error("Should not execute");
      }, "guard1");
      
      const initialError = createValidationError({
        code: VALIDATION_ERROR_CODES.REQUIRED,
        message: "Value required",
        path: "/"
      });
      
      const result = pipe(err(initialError), guard1);
      
      expect(order).toEqual([]); // No guards execute
      expect(result.ok).toBe(false);
    });
  });

  describe("pipeAsync - async chain execution", () => {
    it("should support async guards in pipeAsync", async () => {
      const asyncGuard1 = v.guard(async (val: number) => val > 0, "async1");
      const asyncGuard2 = v.guard(async (val: number) => val < 100, "async2");
      
      const result = await pipeAsync(ok(50), asyncGuard1, asyncGuard2);
      
      expect(result).toEqual(ok(50));
    });

    it("should mix sync and async guards in pipeAsync", async () => {
      const syncGuard = v.guard((val: number) => val > 0, "sync");
      const asyncGuard = v.guard(async (val: number) => val < 100, "async");
      
      const result = await pipeAsync(ok(50), syncGuard, asyncGuard);
      
      expect(result).toEqual(ok(50));
    });

    it("should short-circuit on first failure in async chain", async () => {
      const order: string[] = [];
      
      const asyncGuard1 = v.guard(async (val: number) => {
        order.push("guard1");
        return val > 0;
      }, "guard1");
      
      const asyncGuard2 = v.guard(async () => {
        order.push("guard2");
        throw new Error("Should not execute");
      }, "guard2");
      
      const result = await pipeAsync(ok(-5), asyncGuard1, asyncGuard2);
      
      expect(order).toEqual(["guard1"]); // Short-circuits after first failure
      expect(result.ok).toBe(false);
    });

    it("should handle async exceptions in chain", async () => {
      const asyncThrowGuard = v.guard(async () => {
        throw new Error("Async chain error");
      }, "async-throw");
      
      const result = await pipeAsync(ok(5), asyncThrowGuard);
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(VALIDATION_ERROR_CODES.INTERNAL_GUARD_EXCEPTION);
        expect(result.error.cause).toBe("Async chain error");
      }
    });

    it("should maintain deterministic order with mixed sync/async guards", async () => {
      const order: string[] = [];
      
      const sync1 = v.guard((val: number) => {
        order.push("sync1");
        return true;
      }, "sync1");
      
      const async1 = v.guard(async (val: number) => {
        order.push("async1");
        return true;
      }, "async1");
      
      const sync2 = v.guard((val: number) => {
        order.push("sync2");
        return true;
      }, "sync2");
      
      const async2 = v.guard(async (val: number) => {
        order.push("async2");
        return true;
      }, "async2");
      
      await pipeAsync(ok(42), sync1, async1, sync2, async2);
      
      expect(order).toEqual(["sync1", "async1", "sync2", "async2"]);
    });
  });

  describe("guard naming and error messages", () => {
    it("should use provided guard name in error messages", () => {
      const guard = v.guard((val: number) => false, "custom-name");
      const result = guard(5);
      
      if (result instanceof Promise) {
        throw new Error("Expected sync result");
      }
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("custom-name");
      }
    });

    it("should use default name when not provided", () => {
      const guard = v.guard((val: number) => false);
      const result = guard(5);
      
      if (result instanceof Promise) {
        throw new Error("Expected sync result");
      }
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain("guard");
      }
    });
  });

  describe("complex guard compositions", () => {
    it("should compose schema parsing with guard chains", () => {
      const schema = v.object({
        age: v.number()
      });
      
      const ageGuard = v.guard((age: number) => age >= 18 && age <= 120, "valid-age");
      
      // This would typically be used like:
      // const parseResult = schema.parse({ age: 25 });
      // if (parseResult.ok) {
      //   const guardResult = pipe(ok(parseResult.value.age), ageGuard);
      // }
      
      const guardResult = pipe(ok(25), ageGuard);
      expect(guardResult).toEqual(ok(25));
    });

    it("should chain multiple logical validations", () => {
      const isPositive = v.guard((n: number) => n > 0, "positive");
      const isEven = v.guard((n: number) => n % 2 === 0, "even");
      const isUnder100 = v.guard((n: number) => n < 100, "under-100");
      
      const result = pipe(ok(42), isPositive, isEven, isUnder100);
      expect(result).toEqual(ok(42));
      
      const failEven = pipe(ok(41), isPositive, isEven, isUnder100);
      expect(failEven.ok).toBe(false);
      if (!failEven.ok) {
        expect(failEven.error.code).toBe(VALIDATION_ERROR_CODES.GUARDRAIL_FAILED);
      }
    });
  });
});
