import { ArraySchema } from "./composite/array.js";
import { ObjectSchema } from "./composite/object.js";
import type { PolicySchema } from "./base.js";
import { BooleanSchema } from "./primitive/boolean.js";
import { NumberSchema } from "./primitive/number.js";
import { StringSchema } from "./primitive/string.js";
import {
  createGuard,
  type GuardExecutor,
  type GuardFunction,
  type GuardOptions,
} from "../guard/guard.js";

export const v = {
  string: (): StringSchema => new StringSchema(),
  number: (): NumberSchema => new NumberSchema(),
  boolean: (): BooleanSchema => new BooleanSchema(),
  object: <TShape extends Record<string, PolicySchema<unknown>>>(shape: TShape): ObjectSchema<TShape> =>
    new ObjectSchema(shape),
  array: <TItemSchema extends PolicySchema<unknown>>(schema: TItemSchema): ArraySchema<TItemSchema> =>
    new ArraySchema(schema),
  guard: <T>(fn: GuardFunction<T>, nameOrOptions?: string | GuardOptions): GuardExecutor<T> =>
    createGuard(fn, nameOrOptions),
};